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
  private taskWindow?: BrowserWindow;
  private handler: (event: Electron.IpcMainEvent, value: unknown) => void;
  private archive:ConversationArchive;
  constructor(private parent: BrowserWindow, private tabs: BrowserTabs, private audit: (origin: string, operation: string, outcome: string) => void = () => {},private slot=1) {
    const suffix=slot===1?'':`-${slot}`;
    this.archive=new ConversationArchive(path.join(app.getPath('userData'),`conversation${suffix}.enc`),osCipher);
    const network = session.fromPartition(`toast-model-network${suffix}`); hardenSession(network); let expected = '';
    network.webRequest.onBeforeRequest((details, callback) => callback({ cancel: details.url !== expected || !['POST', 'GET'].includes(details.method) }));
    const adapter = new ModelAdapter(async (url, options) => { expected = url; return network.fetch(url, options); });
    this.service = new AiService(adapter, new KeyVault(path.join(app.getPath('userData'), `ai-keys${suffix}`), osCipher), {
      capture: source => this.capture(source), openTask: url => this.openTask(url), closeTask: () => this.closeTask(), stopTask: () => { const wc = this.task?.view.webContents; if (wc && !wc.isDestroyed()) wc.stop(); }, hide: () => this.hide(),
      confirmWorkflow: async origin => (await dialog.showMessageBox(this.parent,{type:'question',title:'AI 여러 단계 작업',message:'이 사이트의 페이지를 단계마다 AI에 공유할까요?',detail:`${origin}\n최대 10단계입니다. 화면의 개인정보가 포함될 수 있습니다. 입력·클릭·이동 등은 매번 별도로 승인하며 사이트가 바뀌면 중단합니다.`,buttons:['취소','공유하고 시작'],defaultId:0,cancelId:0,noLink:true})).response===1,
      handoff: source => { if(source==='controlled'){this.parent.focus();this.tabs.activeContents()?.focus();}else this.taskWindow?.focus(); }, completed: () => { if(!this.parent.isDestroyed()&&!this.parent.isFocused())this.parent.flashFrame(true); },
      saveChat:messages=>this.archive.save(messages),loadChat:()=>this.archive.load(),deleteChat:()=>this.archive.delete()
    }, () => this.emit());
    void Promise.resolve(osCipher.available()).then(value => this.service.storageAvailable(value), () => this.service.storageAvailable(false));
    this.handler = (event, value) => {
      const wc = this.view?.webContents;
      if (!this.visible || !wc || wc.isDestroyed() || event.sender !== wc || event.senderFrame !== wc.mainFrame || event.senderFrame?.url !== AI_URL || !this.gate.allow()) return;
      const command = parseAiCommand(value); if (command) void this.service.command(command); else this.service.invalidInput();
    };
    ipcMain.on('ai:command', this.handler);
  }
  private emit(): void { const wc = this.view?.webContents; if (wc && !wc.isDestroyed() && wc.getURL() === AI_URL) wc.send('ai:state', this.service.publicState()); }
  observe(): void { this.service.observe(); }
  toggle(): void { if (this.visible) { void this.service.command({ type: 'hide' }); return; } this.show(); }
  open():void {this.show();}
  hideForSwitch():void {this.service.workspaceHidden();this.hide();}
  private show(): void {
    if (!this.view) {
      this.view = new WebContentsView({ webPreferences: { ...WEB_PREFERENCES, session: this.parent.webContents.session, preload: path.join(__dirname, '..', 'ai-preload.js') } });
      const wc = this.view.webContents;
      wc.setWindowOpenHandler(() => ({ action: 'deny' })); wc.on('will-frame-navigate', e => e.preventDefault()); wc.on('will-redirect', e => e.preventDefault()); wc.on('will-attach-webview', e => e.preventDefault());
      wc.on('render-process-gone', () => { void this.service.command({ type: 'stop' }); });
      this.parent.contentView.addChildView(this.view); void wc.loadURL(AI_URL).catch(() => {});
    }
    this.visible = true; this.view.setVisible(true); this.layout(); this.view.webContents.focus(); this.emit();
  }
  private hide(): void { this.visible = false; this.view?.setVisible(false); this.layout(); }
  layout(): void {
    const [width, height] = this.parent.getContentSize(), panelWidth = Math.min(400, Math.max(300, Math.floor(width * .4)));
    this.tabs.reservePanel(this.visible ? panelWidth : 0);
    this.view?.setBounds({ x: width - panelWidth, y: 116, width: panelWidth, height: Math.max(0, height - 116) });
  }
  private async openTask(url: string): Promise<void> {
    this.closeTask();
    const task = createAiTask(); this.task = task;
    const win = new BrowserWindow({ parent: this.parent, title: `ButterToast AI ${this.slot} 작업 — ${new URL(url).origin}`, width: 1000, height: 760, minWidth: 600, minHeight: 400,
      autoHideMenuBar: true, webPreferences: { ...WEB_PREFERENCES, session: this.parent.webContents.session } });
    this.taskWindow = win; win.contentView.addChildView(task.view);
    const layout = () => { const [width, height] = win.getContentSize(); task.view.setBounds({ x: 0, y: 0, width, height }); };
    layout(); win.on('resize', layout);
    win.on('closed', () => { if (this.task === task) { this.task = undefined; this.taskWindow = undefined; this.service.revokeContext(); void task.close().catch(() => {}); } });
    task.view.webContents.on('did-navigate', () => { if (!win.isDestroyed()) win.setTitle(`ButterToast AI ${this.slot} 작업 — ${new URL(task.view.webContents.getURL()).origin}`); });
    try { await bounded(task.view.webContents.loadURL(url), 20000); }
    catch { if (!task.view.webContents.isDestroyed()) task.view.webContents.stop(); throw new Error('Task navigation failed'); }
    if (!win.isDestroyed()) layout();
  }
  private closeTask(): void {
    const task = this.task, window = this.taskWindow; this.task = undefined; this.taskWindow = undefined;
    this.service.revokeContext(); if (window && !window.isDestroyed()) window.destroy();
    if (task) void task.close().catch(() => {});
  }
  private async capture(source: 'human' | 'task' | 'controlled'): Promise<Attachment> {
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
        this.audit(data.origin,proposal.op,result.matches===false?'verification-failed':ok?'executed':'blocked'); return ok;
      };
      return { data, valid: current, check, dispose, act, click: target => act({op:'CLICK',target,value:''}) };
    } catch { dispose(); throw new Error('Page unavailable'); }
  }
  dispose(): void { ipcMain.removeListener('ai:command', this.handler); this.service.dispose(); this.closeTask(); if (this.view && !this.view.webContents.isDestroyed()) this.view.webContents.close({ waitForBeforeUnload: false }); this.view = undefined; }
  flush():Promise<void>{return this.archive.flush();}
}
