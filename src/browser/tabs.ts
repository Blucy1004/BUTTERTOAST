import { BrowserWindow, WebContents, WebContentsView } from 'electron';
import { WEB_PREFERENCES, hardenWebContents } from '../security/electron';
import { restorableUrl, SessionSnapshot, TAB_LIMIT } from './session-store';
import {installIdleProbe} from './idle';
import type { Bounds } from './workspace';
export type TabStatus = 'ready' | 'loading' | 'slow' | 'unresponsive' | 'crashed' | 'suspended';
type Tab = { id: number; title: string; url: string; pinned: boolean; muted: boolean; status: TabStatus; error: string; view?: WebContentsView; slowTimer?: NodeJS.Timeout; lastActive?:number };
type Hooks = { changed: () => void; persist: (snapshot: SessionSnapshot) => void; input: (contents: WebContents) => void; visited?: (url: string, title: string) => void; loaded?: (contents: WebContents) => void; canSuspend?:(contents:WebContents)=>boolean };
/** Human tabs only. No AI context, grants or renderer state are persisted or shared here. */
export class BrowserTabs {
  private tabs: Tab[] = [];
  private closed: { url: string; title: string; pinned: boolean; muted: boolean }[] = [];
  private finding = {open:false,query:'',active:0,matches:0};
  private findRequest = 0;
  private nextId = 1;
  private active = 0;
  private disposed = false;
  private probes = new Map<WebContents, NodeJS.Timeout>();
  private heartbeat: NodeJS.Timeout;
  private memoryTimer:NodeJS.Timeout;
  private memorySaver=false;
  private memoryChecking=false;
  private idleProbes=new WeakSet<WebContents>();
  constructor(private window: BrowserWindow, private hooks: Hooks, private slowAfterMs = 30_000,private idleAfterMs=15*60_000) {
    // Native unresponsive events are not reliable on every host. Probe only the active,
    // fully loaded page, once per five seconds, with at most one outstanding probe.
    this.heartbeat = setInterval(() => this.checkResponsive(), 5000);
    this.heartbeat.unref();
    this.memoryTimer=setInterval(()=>{void this.releaseIdle();},30_000);this.memoryTimer.unref();
  }
  configureMemorySaver(enabled:boolean):void {this.memorySaver=enabled;}
  async releaseIdle(now=Date.now()):Promise<number> {
    if(!this.memorySaver||this.memoryChecking||this.disposed)return 0;
    this.memoryChecking=true;let released=0;
    try {
      for(const tab of this.tabs){
        const wc=tab.view?.webContents;
        const eligible=()=>this.memorySaver&&!this.disposed&&this.current()!==tab&&!tab.pinned&&tab.status==='ready'&&tab.view?.webContents===wc&&!!wc&&!wc.isDestroyed()&&!wc.isLoading()&&!wc.isCrashed()&&!wc.isCurrentlyAudible()&&now-(tab.lastActive??now)>=this.idleAfterMs&&(this.hooks.canSuspend?.(wc)??true);
        if(!wc||this.idleProbes.has(wc)||!eligible())continue;
        let timer:NodeJS.Timeout|undefined;
        try {
          this.idleProbes.add(wc);const probe=wc.executeJavaScriptInIsolatedWorld(1003,[{code:'globalThis.__toastIdle?.() === true'}]).finally(()=>this.idleProbes.delete(wc));
          const safe=await Promise.race([probe,new Promise(resolve=>{timer=setTimeout(()=>resolve(false),500);})]);
          if(safe===true&&eligible()){this.detach(tab);tab.status='suspended';tab.error='메모리 절약으로 쉬는 탭입니다. 선택하면 주소를 다시 엽니다.';released++;this.changed();}
        }catch{}finally{clearTimeout(timer);}
      }
    }finally{this.memoryChecking=false;}
    return released;
  }
  private checkResponsive(): void {
    const tab = this.current(), wc = tab?.view?.webContents;
    if (!tab || !wc || wc.isDestroyed() || wc.isCrashed() || wc.isLoading() || !wc.getURL() || tab.status !== 'ready' || this.probes.has(wc)) return;
    const valid = () => !this.disposed && tab.view?.webContents === wc && !wc.isDestroyed();
    const timeout = setTimeout(() => {
      if (valid() && this.current() === tab && tab.status === 'ready') {
        tab.status = 'unresponsive'; tab.error = '페이지가 응답하지 않습니다. 다른 탭으로 이동하거나 이 탭을 다시 시작하세요.'; this.changed();
      }
    }, 10_000);
    timeout.unref(); this.probes.set(wc, timeout);
    // Constant isolated-world code only: no page data, model strings or exposed IPC.
    void wc.executeJavaScriptInIsolatedWorld(1002, [{ code: 'void 0' }]).then(() => {
      if (valid() && tab.status === 'unresponsive') { tab.status = 'ready'; tab.error = ''; this.changed(); }
    }, () => {}).finally(() => { clearTimeout(timeout); this.probes.delete(wc); });
  }
  private current(): Tab | undefined { return this.tabs.find(t => t.id === this.active); }
  private changed(persist = false): void {
    if (this.disposed) return;
    if (persist && this.tabs.length) this.hooks.persist(this.snapshot());
    this.hooks.changed();
  }
  snapshot(): SessionSnapshot { return { version: 2, active: Math.max(0, this.tabs.findIndex(t => t.id === this.active)), tabs: this.tabs.map(t => ({url:restorableUrl(t.url)?t.url:'',pinned:t.pinned,muted:t.muted})) }; }
  state() {
    const tab = this.current(), wc = tab?.view?.webContents;
    const live = wc && !wc.isDestroyed() && !wc.isCrashed();
    return {
      tabs: this.tabs.map(t => ({ id: t.id, title: t.title, status: t.status, pinned:t.pinned, muted:t.muted,
        host: (()=>{try{return new URL(t.url).hostname;}catch{return '';}})(), audible:!!t.view&&!t.view.webContents.isDestroyed()&&t.view.webContents.isCurrentlyAudible() })), active: this.active,
      tabLimit:TAB_LIMIT,find:{...this.finding}, zoom:live?Math.round(wc.getZoomFactor()*100):100,
      url: tab?.url || '', status: tab?.status || 'ready',
      canBack: !!live && wc.navigationHistory.canGoBack(), canForward: !!live && wc.navigationHistory.canGoForward(),
      loading: tab?.status === 'loading' || tab?.status === 'slow', canReopen: this.closed.length > 0,
      error: tab?.error || ''
    };
  }
  initialize(saved: SessionSnapshot | null): void {
    if (saved) {
      const entries=saved.version===1?saved.tabs.map(url=>({url,pinned:false,muted:false})):saved.tabs;
      for (const entry of entries) this.tabs.push({ id: this.nextId++, title: entry.url ? new URL(entry.url).hostname : '새 탭', ...entry, status: 'suspended', error: '복원 대기: 탭을 선택하면 다시 엽니다.' });
      this.active = this.tabs[saved.active].id; this.changed();
    } else this.newTab();
  }
  private reservedWidth = 0;
  private viewport?: Bounds;
  private workspaceVisible = true;
  setViewport(bounds: Bounds, visible = true): void { this.viewport = bounds; this.workspaceVisible = visible; this.layout(); }
  contentsFor(id: number): WebContents | undefined { return this.tabs.find(t => t.id === id)?.view?.webContents; }
  reservePanel(width: number): void { this.reservedWidth = Math.max(0, Math.min(480, width)); this.layout(); }
  activeContents(): WebContents | undefined { return this.current()?.view?.webContents; }
  allContents(): WebContents[] { return this.tabs.flatMap(t => t.view && !t.view.webContents.isDestroyed() ? [t.view.webContents] : []); }
  revokeOrigin(origin:string):void {
    for(const tab of this.tabs){
      try {if(new URL(tab.url).origin!==origin)continue;}catch{continue;}
      this.detach(tab);tab.status='suspended';tab.error='사이트 권한을 회수해 페이지를 종료했습니다. 탭을 선택하면 다시 엽니다. 입력 내용은 복원되지 않습니다.';
    }
    this.changed();
  }
  suspendAll():void {
    for(const tab of this.tabs){this.detach(tab);tab.status='suspended';tab.error='사이트 데이터를 지우기 위해 페이지를 종료했습니다. 탭을 선택하면 다시 엽니다.';}
    this.changed();
  }
  layout(): void {
    const [width, height] = this.window.getContentSize();
    for (const tab of this.tabs) { tab.view?.setBounds(this.viewport ?? { x: 0, y: 116, width: Math.max(0, width - this.reservedWidth), height: Math.max(0, height - 116) }); tab.view?.setVisible(this.workspaceVisible && tab.id === this.active && !!tab.url); }
  }
  private attach(tab: Tab): void {
    if (tab.view || this.disposed) return;
    const view = new WebContentsView({ webPreferences: { ...WEB_PREFERENCES, partition: 'persist:human' } });
    view.setBorderRadius(16);
    tab.view = view; const wc = view.webContents;
    const valid = () => !this.disposed && tab.view === view && this.tabs.includes(tab);
    const clearSlow = () => { clearTimeout(tab.slowTimer); tab.slowTimer = undefined; };
    this.window.contentView.addChildView(view); view.setVisible(tab.id === this.active);
    hardenWebContents(wc); this.hooks.input(wc);
    wc.setAudioMuted(tab.muted);tab.lastActive=Date.now();
    wc.on('dom-ready',()=>{if(valid())void wc.executeJavaScriptInIsolatedWorld(1003,[{code:`(${installIdleProbe.toString()})()`}]).catch(()=>{});});
    wc.on('media-started-playing',()=>{if(valid())this.changed();});
    wc.on('media-paused',()=>{if(valid())this.changed();});
    wc.on('found-in-page',(_event,result)=>{
      if(valid()&&this.current()===tab&&this.finding.open&&result.requestId===this.findRequest){this.finding.active=result.activeMatchOrdinal;this.finding.matches=result.matches;this.changed();}
    });
    wc.on('did-start-navigation',event=>{if(valid()&&event.isMainFrame&&this.current()===tab)this.clearFind(false);});
    wc.on('did-finish-load', () => { if (valid()) { this.hooks.visited?.(wc.getURL(), wc.getTitle()); this.hooks.loaded?.(wc); } });
    wc.on('page-title-updated', (_e, title) => { if (valid()) { tab.title = title.slice(0, 120) || '새 탭'; this.changed(); } });
    wc.on('did-start-loading', () => {
      if (!valid()) return;
      clearSlow(); tab.status = 'loading'; tab.error = '';
      tab.slowTimer = setTimeout(() => { if (valid() && tab.status === 'loading') { tab.status = 'slow'; tab.error = '페이지 로딩이 오래 걸립니다. 중지하거나 탭을 다시 시작할 수 있습니다.'; this.changed(); } }, this.slowAfterMs);
      tab.slowTimer.unref(); this.changed();
    });
    wc.on('did-stop-loading', () => { if (valid()) { clearSlow(); if (tab.status === 'slow') tab.error = ''; if (['loading', 'slow'].includes(tab.status)) tab.status = 'ready'; this.changed(); } });
    const navigated = (_e: unknown, url: string, mainFrame = true) => {
      if (valid() && mainFrame) { tab.url = url === 'about:blank' ? '' : url; this.changed(true); }
    };
    wc.on('did-navigate', (e, url) => navigated(e, url));
    wc.on('did-navigate-in-page', (e, url, main) => { navigated(e, url, main); if (valid() && main) { this.hooks.visited?.(url, wc.getTitle()); this.hooks.loaded?.(wc); } });
    wc.on('did-fail-load', (_e, code, _description, _url, main) => {
      if (valid() && main && code !== -3) { clearSlow(); tab.status = 'ready'; tab.error = `페이지를 불러오지 못했습니다 (${code}). 주소와 연결 상태를 확인하세요.`; this.changed(); }
    });
    wc.on('unresponsive', () => { if (valid()) { clearSlow(); tab.status = 'unresponsive'; tab.error = '페이지가 응답하지 않습니다. 다른 탭으로 이동하거나 이 탭을 다시 시작하세요.'; this.changed(); } });
    wc.on('responsive', () => { if (valid() && tab.status === 'unresponsive') { tab.status = wc.isLoading() ? 'loading' : 'ready'; tab.error = ''; this.changed(); } });
    wc.on('render-process-gone', () => { if (valid()) { clearSlow(); tab.status = 'crashed'; tab.error = '탭 프로세스가 종료되었습니다. 이 탭을 다시 시작하거나 주소를 입력하세요.'; this.changed(); } });
    wc.on('destroyed', () => { if (valid()) { tab.view = undefined; clearSlow(); tab.status = 'crashed'; tab.error = '탭이 종료되었습니다. 다시 시작할 수 있습니다.'; this.changed(); } });
    tab.status = 'ready'; tab.error = ''; this.layout();
  }
  private detach(tab: Tab): void {
    if(this.current()===tab)this.clearFind(false);
    const view = tab.view; tab.view = undefined;
    clearTimeout(tab.slowTimer); tab.slowTimer = undefined;
    if (!view) return;
    clearTimeout(this.probes.get(view.webContents)); this.probes.delete(view.webContents);
    if (!this.window.isDestroyed()) this.window.contentView.removeChildView(view);
    if (!view.webContents.isDestroyed()) view.webContents.close({ waitForBeforeUnload: false });
  }
  newTab(url = '', title = '새 탭', options = {pinned:false,muted:false}): void {
    if (this.disposed || this.tabs.length >= TAB_LIMIT || !restorableUrl(url)) return;
    this.clearFind(false);
    const tab: Tab = { id: this.nextId++, title, url, ...options, status: 'ready', error: '' }; this.tabs.push(tab);
    this.tabs.sort((a,b)=>Number(b.pinned)-Number(a.pinned));
    this.active = tab.id; this.attach(tab);
    for (const t of this.tabs) t.view?.setVisible(t === tab);
    if (url) void tab.view!.webContents.loadURL(url).catch(() => {});
    this.layout(); this.changed(true);
  }
  select(id: number): void {
    const tab = this.tabs.find(t => t.id === id); if (!tab) return;
    if(this.active!==id)this.clearFind(false);
    const old=this.current();if(old)old.lastActive=Date.now();this.active = id;tab.lastActive=Date.now();
    if (!tab.view && tab.status === 'suspended') {
      this.attach(tab);
      if (!restorableUrl(tab.url)) { tab.url = ''; tab.error = '이 주소는 자동 복원할 수 없습니다. 주소를 다시 입력하세요.'; }
      if (tab.url) void tab.view!.webContents.loadURL(tab.url).catch(() => {});
    }
    for (const t of this.tabs) t.view?.setVisible(t === tab);
    this.layout(); if (tab.view && !tab.view.webContents.isDestroyed()) tab.view.webContents.focus(); this.changed(true);
  }
  cycle(delta: number): void { if (!this.tabs.length) return; const index = this.tabs.findIndex(t => t.id === this.active); this.select(this.tabs[(index + delta + this.tabs.length) % this.tabs.length]?.id); }
  selectNumber(number: number): void { const tab = number === 9 ? this.tabs.at(-1) : this.tabs[number - 1]; if (tab) this.select(tab.id); }
  move(id: number, delta: -1 | 1): void {
    const index = this.tabs.findIndex(t => t.id === id), next = index + delta;
    if (index < 0 || next < 0 || next >= this.tabs.length || this.tabs[index].pinned!==this.tabs[next].pinned) return;
    [this.tabs[index], this.tabs[next]] = [this.tabs[next], this.tabs[index]]; this.changed(true);
  }
  reorder(id:number,before:number):void {
    const source=this.tabs.find(t=>t.id===id),target=this.tabs.find(t=>t.id===before);
    if(!source||!target||source===target||source.pinned!==target.pinned)return;
    this.tabs.splice(this.tabs.indexOf(source),1);this.tabs.splice(this.tabs.indexOf(target),0,source);this.changed(true);
  }
  close(id = this.active): void {
    const index = this.tabs.findIndex(t => t.id === id); if (index < 0) return;
    if(this.active===id)this.clearFind(false);
    const [tab] = this.tabs.splice(index, 1);
    this.closed.push({ url: restorableUrl(tab.url) ? tab.url : '', title: tab.title, pinned:tab.pinned, muted:tab.muted }); if (this.closed.length > 20) this.closed.shift();
    this.detach(tab);
    if (!this.tabs.length) this.newTab();
    else if (this.active === id) this.select(this.tabs[Math.min(index, this.tabs.length - 1)].id);
    else this.changed(true);
  }
  reopen(): void { if (this.tabs.length >= TAB_LIMIT) return; const old = this.closed.pop(); if (old) this.newTab(old.url, old.title,{pinned:old.pinned,muted:old.muted}); }
  pin(id:number):void {const tab=this.tabs.find(t=>t.id===id);if(!tab)return;tab.pinned=!tab.pinned;this.tabs.sort((a,b)=>Number(b.pinned)-Number(a.pinned));this.changed(true);}
  mute(id:number):void {const tab=this.tabs.find(t=>t.id===id);if(!tab)return;tab.muted=!tab.muted;if(tab.view&&!tab.view.webContents.isDestroyed())tab.view.webContents.setAudioMuted(tab.muted);this.changed(true);}
  duplicate(id:number):void {const tab=this.tabs.find(t=>t.id===id);if(tab)this.newTab(restorableUrl(tab.url)?tab.url:'',tab.title,{pinned:false,muted:tab.muted});}
  closableOthers(id:number):number[] {return this.tabs.some(t=>t.id===id)?this.tabs.filter(t=>t.id!==id&&!t.pinned).map(t=>t.id):[];}
  closeMany(ids:number[]):void {for(const id of ids)this.close(id);}
  openFind():void {this.finding.open=true;this.changed();}
  clearFind(notify=true):void {
    this.findRequest=0;
    const wc=this.activeContents();if(wc&&!wc.isDestroyed()&&!wc.isCrashed())wc.stopFindInPage('clearSelection');
    this.finding={open:false,query:'',active:0,matches:0};if(notify)this.changed();
  }
  find(text:string,forward=true,next=false):void {
    const wc=this.activeContents();if(!wc||wc.isDestroyed()||wc.isCrashed()||wc.isLoading()||text.length>256)return;
    const same=this.finding.query===text;
    this.findRequest=0;this.finding={open:true,query:text,active:0,matches:0};
    if(text)this.findRequest=wc.findInPage(text,{forward,findNext:next&&same});else wc.stopFindInPage('clearSelection');
    this.changed();
  }
  zoom(direction:-1|0|1):void {
    const wc=this.activeContents();if(!wc||wc.isDestroyed()||wc.isCrashed())return;
    const levels=[.5,.67,.8,.9,1,1.1,1.25,1.5,1.75,2,2.5,3],current=wc.getZoomFactor();
    const next=direction===0?1:direction>0?levels.find(n=>n>current+.01)??3:[...levels].reverse().find(n=>n<current-.01)??.5;
    wc.setZoomFactor(next);this.changed();
  }
  setError(message: string): void { const tab = this.current(); if (tab) { tab.error = message; this.changed(); } }
  navigate(url: string): void {
    const tab = this.current(); if (!tab || !restorableUrl(url) || !url) return;
    if (tab.status === 'unresponsive' || tab.status === 'crashed') this.detach(tab);
    this.attach(tab); tab.url = url; tab.error = '';
    void tab.view!.webContents.loadURL(url).catch(() => {}); this.changed(true);
  }
  restart(): void {
    const tab = this.current(); if (!tab) return;
    this.detach(tab); this.attach(tab);
    if (!restorableUrl(tab.url)) { tab.url = ''; tab.error = '이 주소는 자동 복원할 수 없습니다. 주소를 다시 입력하세요.'; }
    if (tab.url) void tab.view!.webContents.loadURL(tab.url).catch(() => {}); this.changed(true);
  }
  suspend(): void {
    const tab = this.current(); if (!tab || !tab.view) return;
    this.detach(tab); tab.status = 'suspended'; tab.error = '메모리 해제됨: 탭을 선택하면 주소를 다시 엽니다. 입력 내용은 복원되지 않습니다.'; this.changed();
  }
  history(direction: 'back' | 'forward' | 'reload' | 'reload-hard' | 'stop'): void {
    const tab = this.current(), wc = tab?.view?.webContents;
    if (!wc || wc.isDestroyed()) return;
    if (direction === 'back' && wc.navigationHistory.canGoBack()) wc.navigationHistory.goBack();
    if (direction === 'forward' && wc.navigationHistory.canGoForward()) wc.navigationHistory.goForward();
    if (direction === 'reload') wc.reload();
    if (direction === 'reload-hard') wc.reloadIgnoringCache();
    if (direction === 'stop') { wc.stop(); if (tab && ['loading', 'slow'].includes(tab.status)) { tab.status = 'ready'; tab.error = '페이지 로딩을 중지했습니다.'; clearTimeout(tab.slowTimer); this.changed(); } }
  }
  dispose(): void { this.disposed = true; clearInterval(this.heartbeat);clearInterval(this.memoryTimer); for (const tab of this.tabs) this.detach(tab); this.tabs = []; }
}
