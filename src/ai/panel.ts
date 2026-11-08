import { app, BrowserWindow, WebContents, WebContentsView, dialog, ipcMain, session } from 'electron';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { BrowserTabs } from '../browser/tabs';
import { createAiTask } from '../browser/ai-task';
import { ToastController } from '../toastir/controller';
import { WEB_PREFERENCES, hardenSession } from '../security/electron';
import { osCipher } from '../security/os-cipher';
import { KeyVault } from '../security/vault';
import { RateGate } from '../security/ipc';
import { ModelAdapter } from './adapter';
import { AiService, Attachment, PageContext } from './service';
import { parseAiCommand, safeText, Proposal } from './protocol';
import {ConversationArchive} from './archive';
import { Bounds } from '../browser/workspace';
import { CursorVisualizer, VisualEvent } from './visualizer';
export const AI_URL = 'toast-ui://app/ai.html';
const controlOwners=new WeakMap<WebContents,()=>void>();
async function bounded<T>(operation: Promise<T>, milliseconds = 5000): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try { return await Promise.race([operation, new Promise<never>((_resolve, reject) => { timer = setTimeout(() => reject(new Error('Page timed out')), milliseconds); timer.unref(); })]); }
  finally { clearTimeout(timer); }
}
export class AiPanel {
  private view?: WebContentsView;
  private visible = false;
  private gate = new RateGate();
  private service: AiService;
  private task?: ReturnType<typeof createAiTask>;
  private bounds: Bounds = {x:0,y:80,width:420,height:650};
  private presented = true;
  private mode: 'status' | 'page' | 'controls' = 'status';
  private taskDocument = '';
  private events: VisualEvent[] = [];
  private eventId = 0;
  private cursor: CursorVisualizer;
  private visual = {speed:1,motion:true};
  private delegating = false;
  private handler: (event: Electron.IpcMainEvent, value: unknown) => void;
  private archive:ConversationArchive;
  constructor(private parent: BrowserWindow, private tabs: BrowserTabs, private audit: (origin: string, operation: string, outcome: string) => void = () => {},private slot=1, private visibility: (visible:boolean)=>void = () => {}) {
    this.cursor = new CursorVisualizer(parent,()=>{void this.service.command({type:'handoff'});});
    const suffix=slot===1?'':`-${slot}`;
    this.archive=new ConversationArchive(path.join(app.getPath('userData'),`conversation${suffix}.enc`),osCipher);
    const network = session.fromPartition(`toast-model-network${suffix}`); hardenSession(network); let expected = '';
    network.webRequest.onBeforeRequest((details, callback) => callback({ cancel: details.url !== expected || !['POST', 'GET'].includes(details.method) }));
    const adapter = new ModelAdapter(async (url, options) => { expected = url; return network.fetch(url, options); });
    this.service = new AiService(adapter, new KeyVault(path.join(app.getPath('userData'), `ai-keys${suffix}`), osCipher), {
      capture: (source,selected) => this.capture(source,selected), openTask: url => this.openTask(url), closeTask: () => this.closeTask(), stopTask: () => { const wc = this.task?.view.webContents; if (wc && !wc.isDestroyed()) wc.stop(); }, hide: () => this.hide(),
      confirmWorkflow: async origin => (await dialog.showMessageBox(this.parent,{type:'question',title:'AI 여러 단계 작업',message:'이 사이트의 페이지를 단계마다 AI에 공유할까요?',detail:`${origin}\n최대 10단계입니다. 화면의 개인정보가 포함될 수 있습니다. 입력·클릭·이동 등은 매번 별도로 승인하며 사이트가 바뀌면 중단합니다.`,buttons:['취소','공유하고 시작'],defaultId:0,cancelId:0,noLink:true})).response===1,
      handoff: source => { if(source==='controlled'){this.parent.focus();this.tabs.activeContents()?.focus();}else {this.mode='page';this.show();this.layout();this.task?.view.webContents.focus();} }, completed: () => { if(!this.parent.isDestroyed()&&!this.parent.isFocused())this.parent.flashFrame(true); },
      saveChat:messages=>this.archive.save(messages),loadChat:()=>this.archive.load(),deleteChat:()=>this.archive.delete()
    }, () => this.emit());
    void Promise.resolve(osCipher.available()).then(value => this.service.storageAvailable(value), () => this.service.storageAvailable(false));
    this.handler = (event, value) => {
      const wc = this.view?.webContents;
      if (!this.visible || !this.presented || !wc || wc.isDestroyed() || event.sender !== wc || event.senderFrame !== wc.mainFrame || event.senderFrame?.url !== AI_URL || !this.gate.allow()) return;
      const command = parseAiCommand(value);
      if (!command) { this.service.invalidInput(); return; }
      if (command.type==='task-display') { this.mode=command.mode;this.layout();this.emit();return; }
      if (command.type==='visual-options') {this.visual={speed:command.speed,motion:command.motion};this.cursor.clear();this.emit();return;}
      if (command.type==='replay') {const e=this.events.find(e=>e.id===command.id);if(e&&e.document===this.taskDocument&&this.mode==='page'&&e.outcome==='executed')this.cursor.show(e,this.taskBounds(),this.visual.speed,this.visual.motion);return;}
      if (command.type==='task-return') {void this.returnResult().catch(()=>{});return;}
      void this.service.command(command);
    };
    ipcMain.on('ai:command', this.handler);
  }
  private emit(): void { const wc = this.view?.webContents; if (wc && !wc.isDestroyed() && wc.getURL() === AI_URL) wc.send('ai:state', {...this.service.publicState(), display:{mode:this.mode,slot:this.slot,url:this.task?.view.webContents.getURL()??'',events:this.events,visual:this.visual,hasTask:!!this.task}}); }
  observe(): void { this.service.observe(); }
  toggle(): void { if (this.visible) { void this.service.command({ type: 'hide' }); return; } this.show(); }
  open():void {this.show();}
  hideForSwitch():void {this.service.workspaceHidden();this.hide();}
  private show(): void {
    if (!this.view) {
      this.view = new WebContentsView({ webPreferences: { ...WEB_PREFERENCES, session: this.parent.webContents.session, preload: path.join(__dirname, '..', 'ai-preload.js') } });
      this.view.setBorderRadius(18);this.view.setBackgroundColor('#00000000');
      const wc = this.view.webContents;
      wc.setWindowOpenHandler(() => ({ action: 'deny' })); wc.on('will-frame-navigate', e => e.preventDefault()); wc.on('will-redirect', e => e.preventDefault()); wc.on('will-attach-webview', e => e.preventDefault());
      wc.on('render-process-gone', () => { void this.service.command({ type: 'stop' }); });
      this.parent.contentView.addChildView(this.view); void wc.loadURL(AI_URL).catch(() => {});
    }
    this.visible = true; this.visibility(true); this.view.setVisible(this.presented); this.layout(); this.view.webContents.focus(); this.emit();
  }
  private hide(): void { this.visible = false; this.view?.setVisible(false); this.layout();this.visibility(false); }
  isOpen():boolean {return this.visible;}
  setPresentation(bounds:Bounds,visible:boolean):void {const changed=JSON.stringify(bounds)!==JSON.stringify(this.bounds)||visible!==this.presented;this.bounds=bounds;this.presented=visible;if(!visible)this.service.workspaceHidden();if(changed)this.layout();}
  private taskBounds():Bounds {return {x:this.bounds.x+1,y:this.bounds.y+87,width:Math.max(0,this.bounds.width-2),height:Math.max(0,this.bounds.height-256)};}
  layout(): void {
    this.cursor.clear();
    this.view?.setBounds(this.bounds);this.view?.setVisible(this.visible&&this.presented);
    this.task?.view.setBounds(this.taskBounds());this.task?.view.setVisible(this.visible&&this.presented&&this.mode==='page');
  }
  async delegate(id:number):Promise<void> {
    if(this.delegating)return;this.delegating=true;
    try {
      const wc=this.tabs.contentsFor(id);if(!wc||wc.isDestroyed()||wc.isLoading())return;
      const original=wc.getURL(),frame=wc.mainFrame,url=new URL(original);
      if(url.protocol!=='https:'||url.username||url.password)return;
      // Query/fragment can contain login links or secrets. Never copy them implicitly.
      url.search='';url.hash='';
      const answer=await dialog.showMessageBox(this.parent,{type:'question',title:'Toast에 보내기',message:'이 페이지를 별도 AI 세션에서 열까요?',detail:`${url.href}\n원본 탭은 그대로 유지합니다. 쿠키·로그인·선택 텍스트·검색 인자는 복사하지 않습니다. 기존 Toast 작업은 종료됩니다. 모델 전송과 실제 동작은 별도로 승인합니다.`,buttons:['취소','Toast에서 열기'],defaultId:0,cancelId:0,noLink:true});
      if(answer.response!==1||wc.isDestroyed()||wc.getURL()!==original||wc.mainFrame!==frame)return;
      this.mode='status';this.show();await this.service.command({type:'stop'});await this.service.command({type:'task-open',url:url.href});
    } catch {this.tabs.setError('HTTPS 페이지를 연 뒤 다시 Toast에 보내세요.');} finally {this.delegating=false;}
  }
  private async returnResult():Promise<void> {
    const wc=this.task?.view.webContents;if(!wc||wc.isDestroyed())return;
    const url=wc.getURL();let parsed:URL;try{parsed=new URL(url);}catch{return;}
    if(parsed.protocol!=='https:'||parsed.username||parsed.password)return;
    const answer=await dialog.showMessageBox(this.parent,{type:'question',title:'결과 탭 가져오기',message:'결과 주소를 중앙 새 탭에서 열까요?',detail:`${safeText(url,4096)}\nAI 세션의 쿠키나 입력값을 복사하지 않습니다.`,buttons:['취소','새 탭에서 열기'],defaultId:0,cancelId:0,noLink:true});
    if(answer.response===1&&!wc.isDestroyed()&&this.task?.view.webContents===wc&&wc.getURL()===url)this.tabs.newTab(url);
  }
  private async openTask(url: string): Promise<void> {
    this.closeTask();const task=createAiTask();this.task=task;
    this.parent.contentView.addChildView(task.view);this.layout();
    const wc=task.view.webContents;
    wc.on('did-start-navigation',e=>{if(e.isMainFrame&&this.task===task){this.taskDocument='';this.cursor.clear();this.service.observe();this.emit();}});
    wc.on('did-navigate',()=>this.emit());wc.on('did-stop-loading',()=>this.emit());
    wc.on('render-process-gone',()=>{this.taskDocument='';this.cursor.clear();this.service.revokeContext();this.emit();});
    try {await bounded(wc.loadURL(url),20000);}catch {if(!wc.isDestroyed())wc.stop();throw new Error('Task navigation failed');}
    this.layout();this.emit();
  }
  private closeTask(): void {
    const task=this.task;this.task=undefined;this.taskDocument='';this.events=[];this.cursor.clear();
    this.service.revokeContext();
    if(task){if(!this.parent.isDestroyed())this.parent.contentView.removeChildView(task.view);void task.close().catch(()=>{});}
    this.emit();
  }
  private async capture(source: 'human' | 'task' | 'controlled',selectionOnly=false): Promise<Attachment> {
    const wc = source !== 'task' ? this.tabs.activeContents() : this.task?.view.webContents;
    if (!wc || wc.isDestroyed() || wc.isCrashed() || wc.isLoading() || new URL(wc.getURL()).protocol !== 'https:') throw new Error('Page unavailable');
    if(source==='controlled') {
      const url=wc.getURL(),frame=wc.mainFrame;
      const answer=await dialog.showMessageBox(this.parent,{type:'warning',title:'현재 탭 제어 공유',message:'현재 탭의 동작 제안을 AI에 허용할까요?',detail:`${new URL(url).origin}\n페이지 내용을 AI에 보낼 수 있습니다. 실제 동작은 별도로 승인합니다. 이 탭에서 직접 클릭하거나 키를 입력하면 제어 공유를 회수합니다.`,buttons:['취소','이번 공유 허용'],defaultId:0,cancelId:0,noLink:true});
      if(answer.response!==1||wc.isDestroyed()||this.tabs.activeContents()!==wc||wc.mainFrame!==frame||wc.getURL()!==url)throw new Error('Control denied');
    }
    const controller = new ToastController(wc); let valid = true;
    const invalidate = () => { valid = false; this.service.observe(); };
    if(source==='controlled'){controlOwners.get(wc)?.();controlOwners.set(wc,invalidate);}
    const navigate = (event: { isMainFrame: boolean }) => { if (event.isMainFrame) invalidate(); };
    wc.on('did-start-navigation', navigate); wc.on('destroyed', invalidate); wc.on('render-process-gone', invalidate);
    const mouse=(_event:unknown,input:Electron.MouseInputEvent)=>{if(input.type==='mouseDown')invalidate();};
    if(source!=='human'){wc.on('before-input-event',invalidate);wc.on('before-mouse-event',mouse);}
    const current = () => valid && !wc.isDestroyed() && !wc.isCrashed() && (source !== 'task' ? this.tabs.activeContents() === wc : this.task?.view.webContents === wc);
    const dispose = () => { valid = false;if(controlOwners.get(wc)===invalidate)controlOwners.delete(wc);controller.dispose(); wc.removeListener('did-start-navigation', navigate); wc.removeListener('destroyed', invalidate); wc.removeListener('render-process-gone', invalidate);wc.removeListener('before-input-event',invalidate);wc.removeListener('before-mouse-event',mouse); };
    try {
      controller.grant(new Set(['read'])); const snapshot = await bounded(controller.snapshot()); if (!current()) throw new Error('Page changed');
      if(source==='task')this.taskDocument=snapshot.document;
      if(selectionOnly){snapshot.text=await bounded(controller.selectedText());snapshot.elements=[];if(!snapshot.text||!current())throw new Error('Selection unavailable');}
      const data: PageContext = { source, origin: snapshot.origin, text: safeText(snapshot.text, 12000), elements: snapshot.elements.filter(e => e.visible && e.enabled && !e.sensitive)
        .sort((a,b) => Number(b.actions.includes('CLICK'))-Number(a.actions.includes('CLICK'))).slice(0, 100).map(e => ({ id: e.id, role: e.role, name: safeText(e.name, 160), actions: e.actions })) };
      const check = async () => { if (!current()) return false; try { const latest = await bounded(controller.snapshot()); return current() && latest.document === snapshot.document && latest.version === snapshot.version; } catch { return false; } };
      const act = async (proposal: Proposal): Promise<boolean> => {
        const element = data.elements.find(e => e.id === proposal.target);
        if (source === 'human' || (proposal.target && (!element || !element.actions?.includes(proposal.op))) || !await check()) return false;
        controller.grant(new Set(['read', 'write', 'transmit', 'delete', 'pay']));
        const action = { protocol: 2, document: snapshot.document, id: randomUUID(), tab: snapshot.tab, origin: snapshot.origin, version: snapshot.version, ...proposal };
        const requiresApproval = ['CLICK','FILL','SELECT','SCROLL','NAVIGATE'].includes(proposal.op);
        const approval = requiresApproval ? await controller.requestApproval(action, async () => {
          const answer = await dialog.showMessageBox(this.parent, { type: 'warning', title: `AI ${this.slot} 동작 확인`, message: `${proposal.op} 동작을 한 번 실행할까요?`,
            detail: `사이트: ${data.origin}\n대상: ${(element?.name || '현재 페이지').replace(/\s+/g, ' ')}\n값: ${safeText(proposal.value,4096)}\n\n웹페이지 동작은 데이터 전송·삭제·결제를 일으킬 수도 있습니다.`, buttons: ['취소', '한 번 실행'], defaultId: 0, cancelId: 0, noLink: true });
          return answer.response === 1 && current();
        }) : undefined;
        if (!current() || (requiresApproval && !approval)) { this.audit(data.origin,proposal.op,'cancelled'); return false; }
        const result = await controller.execute(action, approval ?? undefined);
        const ok=result.ok&&result.matches!==false;
        const outcome=result.matches===false?'verification-failed':ok?'executed':'blocked';
        this.audit(data.origin,proposal.op,outcome);
        if(source==='task'){
          const event:VisualEvent={id:++this.eventId,time:Date.now(),document:snapshot.document,operation:proposal.op,target:proposal.target,name:safeText(element?.name||'페이지',160),outcome,...(ok&&result.point?{point:result.point}:{})};
          this.events.push(event);if(this.events.length>200)this.events.shift();
          if(ok&&this.mode==='page'&&this.visible&&this.presented&&this.taskDocument===snapshot.document)this.cursor.show(event,this.taskBounds(),1,this.visual.motion);
          this.emit();
        }
        return ok;
      };
      return { data, valid: current, check, dispose, act, click: target => act({op:'CLICK',target,value:''}) };
    } catch { dispose(); throw new Error('Page unavailable'); }
  }
  dispose(): void { ipcMain.removeListener('ai:command', this.handler); this.service.dispose(); this.closeTask();this.cursor.dispose(); if (this.view && !this.view.webContents.isDestroyed()) this.view.webContents.close({ waitForBeforeUnload: false }); this.view = undefined; }
  flush():Promise<void>{return this.archive.flush();}
}
