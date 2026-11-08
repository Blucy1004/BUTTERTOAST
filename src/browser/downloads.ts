import { app, BrowserWindow, dialog, DownloadItem, Session, shell, WebContents } from 'electron';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { safeDownloadName, safeDownloadChain, executableName } from './download-policy';
type Download = { id: string; name: string; origin: string; received: number; total: number; state: string; paused: boolean; path: string; item: DownloadItem };
export class DownloadManager {
  private entries = new Map<string, Download>();
  private prompting = false;
  private lastPrompt = 0;
  constructor(private parent: BrowserWindow, private active: () => WebContents | undefined, private changed: () => void) {}
  snapshot() { return [...this.entries.values()].reverse().map(({ item, path: _path, ...entry }) => entry); }
  /** Called synchronously from will-download so no bytes are written before a native destination decision. */
  accept = (event: Electron.Event, item: DownloadItem, wc: WebContents): void => {
    const chain = item.getURLChain();
    if (!wc || wc.isDestroyed() || wc !== this.active() || !safeDownloadChain(chain) || this.prompting || this.parent.isDestroyed()
      || Date.now() - this.lastPrompt < 1500 || [...this.entries.values()].filter(e => ['progressing', 'interrupted'].includes(e.state)).length >= 5) { event.preventDefault(); return; }
    this.prompting = true; this.lastPrompt = Date.now();
    const name = safeDownloadName(item.getFilename()), origin = new URL(item.getURL()).origin;
    try {
      const response = dialog.showMessageBoxSync(this.parent, { type: 'warning', title: '파일 다운로드', message: `${name} 파일을 저장할까요?`,
        detail: `제공 사이트: ${origin}\n${executableName(name) ? '실행 가능한 파일입니다. 신뢰하는 출처인지 확인하세요.\n' : ''}다운로드 후 자동으로 열거나 실행하지 않습니다.`,
        buttons: ['취소', '저장 위치 선택'], defaultId: 0, cancelId: 0, noLink: true });
      if (response !== 1 || wc.isDestroyed() || wc !== this.active()) { event.preventDefault(); return; }
      const destination = dialog.showSaveDialogSync(this.parent, { title: '다운로드 저장', defaultPath: path.join(app.getPath('downloads'), name), properties: ['showOverwriteConfirmation'] });
      if (!destination || wc.isDestroyed() || wc !== this.active()) { event.preventDefault(); return; }
      item.setSavePath(destination);
      while (this.entries.size >= 100) {
        const old = [...this.entries.values()].find(e => !['progressing', 'interrupted'].includes(e.state));
        if (!old) { event.preventDefault(); return; } this.entries.delete(old.id);
      }
      const entry: Download = { id: randomUUID(), name, origin, received: 0, total: item.getTotalBytes(), state: 'progressing', paused: false, path: destination, item };
      this.entries.set(entry.id, entry);
      item.on('updated', (_e, state) => { entry.state = state; entry.received = item.getReceivedBytes(); entry.total = item.getTotalBytes(); entry.paused = item.isPaused(); this.changed(); });
      item.once('done', (_e, state) => { entry.state = state; entry.paused = false; this.changed(); }); this.changed();
    } catch { event.preventDefault(); } finally { this.prompting = false; }
  };
  action(id: string, action: 'pause' | 'resume' | 'cancel' | 'show' | 'remove'): void {
    const entry = this.entries.get(id); if (!entry) return;
    try {
      if (action === 'show' && entry.state === 'completed') shell.showItemInFolder(entry.path);
      if (action === 'remove' && !['progressing', 'interrupted'].includes(entry.state)) this.entries.delete(id);
      if (['progressing', 'interrupted'].includes(entry.state)) {
        if (action === 'cancel') entry.item.cancel();
        if (action === 'pause') entry.item.pause();
        if (action === 'resume' && entry.item.canResume()) entry.item.resume();
      }
      this.changed();
    } catch { /* Completed native items no longer expose live methods. */ }
  }
  dispose(): void { for (const e of this.entries.values()) if (['progressing', 'interrupted'].includes(e.state)) { try { e.item.cancel(); } catch {} } }
}
