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
import { parseAiCommand, safeText } from './protocol';
export const AI_URL = 'toast-ui://app/ai.html';
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
  constructor(private parent: BrowserWindow, private tabs: BrowserTabs) {
    const network = session.fromPartition('toast-model-network'); hardenSession(network); let expected = '';
    network.webRequest.onBeforeRequest((details, callback) => callback({ cancel: details.url !== expected || !['POST', 'GET'].includes(details.method) }));
    const adapter = new ModelAdapter(async (url, options) => { expected = url; return network.fetch(url, options); });
    this.service = new AiService(adapter, new KeyVault(path.join(app.getPath('userData'), 'ai-keys'), osCipher), {
      capture: source => this.capture(source), openTask: url => this.openTask(url), closeTask: () => this.closeTask(), stopTask: () => { const wc = this.task?.view.webContents; if (wc && !wc.isDestroyed()) wc.stop(); }, hide: () => this.hide()
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
    const win = new BrowserWindow({ parent: this.parent, title: `ButterToast AI 작업 — ${new URL(url).origin}`, width: 1000, height: 760, minWidth: 600, minHeight: 400,
      autoHideMenuBar: true, webPreferences: { ...WEB_PREFERENCES, session: this.parent.webContents.session } });
    this.taskWindow = win; win.contentView.addChildView(task.view);
    const layout = () => { const [width, height] = win.getContentSize(); task.view.setBounds({ x: 0, y: 0, width, height }); };
    layout(); win.on('resize', layout);
    win.on('closed', () => { if (this.task === task) { this.task = undefined; this.taskWindow = undefined; this.service.revokeContext(); void task.close().catch(() => {}); } });
    task.view.webContents.on('did-navigate', () => { if (!win.isDestroyed()) win.setTitle(`ButterToast AI 작업 — ${new URL(task.view.webContents.getURL()).origin}`); });
    try { await bounded(task.view.webContents.loadURL(url), 20000); }
    catch { if (!task.view.webContents.isDestroyed()) task.view.webContents.stop(); throw new Error('Task navigation failed'); }
    if (!win.isDestroyed()) layout();
  }
  private closeTask(): void {
    const task = this.task, window = this.taskWindow; this.task = undefined; this.taskWindow = undefined;
    this.service.revokeContext(); if (window && !window.isDestroyed()) window.destroy();
    if (task) void task.close().catch(() => {});
  }
  private async capture(source: 'human' | 'task'): Promise<Attachment> {
    const wc = source === 'human' ? this.tabs.activeContents() : this.task?.view.webContents;
    if (!wc || wc.isDestroyed() || wc.isCrashed() || wc.isLoading() || new URL(wc.getURL()).protocol !== 'https:') throw new Error('Page unavailable');
    const controller = new ToastController(wc); let valid = true;
    const invalidate = () => { valid = false; this.service.observe(); };
    const navigate = (event: { isMainFrame: boolean }) => { if (event.isMainFrame) invalidate(); };
    wc.on('did-start-navigation', navigate); wc.on('destroyed', invalidate); wc.on('render-process-gone', invalidate);
    const current = () => valid && !wc.isDestroyed() && !wc.isCrashed() && (source === 'human' ? this.tabs.activeContents() === wc : this.task?.view.webContents === wc);
    const dispose = () => { valid = false; controller.dispose(); wc.removeListener('did-start-navigation', navigate); wc.removeListener('destroyed', invalidate); wc.removeListener('render-process-gone', invalidate); };
    try {
      controller.grant(new Set(['read'])); const snapshot = await bounded(controller.snapshot()); if (!current()) throw new Error('Page changed');
      const data: PageContext = { source, origin: snapshot.origin, text: safeText(snapshot.text, 12000), elements: snapshot.elements.filter(e => e.visible && e.enabled && !e.sensitive).slice(0, 100).map(e => ({ id: e.id, role: e.role, name: safeText(e.name, 160) })) };
      const check = async () => { if (!current()) return false; try { const latest = await bounded(controller.snapshot()); return current() && latest.document === snapshot.document && latest.version === snapshot.version; } catch { return false; } };
      return { data, valid: current, check, dispose, click: async target => {
        const element = data.elements.find(e => e.id === target);
        if (source !== 'task' || !element || !await check()) return false;
        controller.grant(new Set(['read', 'write', 'transmit', 'delete', 'pay']));
        const action = { protocol: 2, document: snapshot.document, id: randomUUID(), tab: snapshot.tab, origin: snapshot.origin, version: snapshot.version, op: 'CLICK', target, value: '' };
        const approval = await controller.requestApproval(action, async () => {
          const answer = await dialog.showMessageBox(this.parent, { type: 'warning', title: 'AI 클릭 확인', message: '이 요소를 한 번 클릭할까요?',
            detail: `사이트: ${data.origin}\n대상: ${element.name.replace(/\s+/g, ' ')}\n\n클릭은 데이터 전송·삭제·결제를 일으킬 수도 있습니다.`, buttons: ['취소', '한 번 실행'], defaultId: 0, cancelId: 0, noLink: true });
          return answer.response === 1 && current();
        });
        return approval && current() ? (await controller.execute(action, approval)).ok : false;
      } };
    } catch { dispose(); throw new Error('Page unavailable'); }
  }
  dispose(): void { ipcMain.removeListener('ai:command', this.handler); this.service.dispose(); this.closeTask(); if (this.view && !this.view.webContents.isDestroyed()) this.view.webContents.close({ waitForBeforeUnload: false }); this.view = undefined; }
}
