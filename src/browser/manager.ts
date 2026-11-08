import { BrowserWindow, dialog, ipcMain, session } from 'electron';
import path from 'node:path';
import { BrowserTabs } from './tabs';
import { BrowserLibrary } from './library';
import { DownloadManager } from './downloads';
import { RateGate } from '../security/ipc';
import { WEB_PREFERENCES } from '../security/electron';
import { parseManagerCommand } from './manager-protocol';
import { openDefaultBrowserSettings } from './default-browser';
import {BrowserUpdates} from './updates';
export const MANAGER_URL = 'toast-ui://app/manager.html';
export class BrowserManager {
  private window?: BrowserWindow;
  private gate = new RateGate();
  private message = '';
  private busy = false;
  private handler = (event: Electron.IpcMainEvent, value: unknown) => {
    const wc = this.window?.webContents;
    if (!wc || wc.isDestroyed() || event.sender !== wc || event.senderFrame !== wc.mainFrame || event.senderFrame.url !== MANAGER_URL || !this.gate.allow()) return;
    const command = parseManagerCommand(value); if (!command) return;
    if (command.type === 'ready') { this.emit(); return; }
    if (this.busy) return;
    switch (command.type) {
      case 'bookmark-current': this.bookmark(); break;
      case 'settings': this.library.configure(command.settings); this.changedSettings(); break;
      case 'history-clear': this.library.clear('history'); break;
      case 'audit-clear': this.library.clear('audit'); break;
      case 'bookmark-rename': this.library.rename(command.id, command.title); break;
      case 'entry-remove': this.library.remove(command.kind, command.id); break;
      case 'entry-open': { const entry = this.library.snapshot()[command.kind].find(e => e.id === command.id); if (entry) { this.tabs.newTab(entry.url); this.parent.focus(); } break; }
      case 'permission': this.library.setPermission(command.origin, command.permission, command.decision);if(command.decision!=='allow')this.tabs.revokeOrigin(command.origin); break;
      case 'download': this.downloads.action(command.id, command.action); break;
      case 'default-browser': this.busy = true; void openDefaultBrowserSettings().then(message => { this.message = message; }, () => { this.message = '기본 브라우저 등록을 완료하지 못했습니다.'; }).finally(() => { this.busy = false; this.emit(); }); break;
      case 'clear-site-data': void this.clearSiteData(); break;
      case 'update-check': void this.updates.check();break;
      case 'update-install': void this.updates.install();break;
    }
    this.emit();
  };
  constructor(private parent: BrowserWindow, private tabs: BrowserTabs, private library: BrowserLibrary, private downloads: DownloadManager, private changedSettings: () => void,private updates:BrowserUpdates) { ipcMain.on('manager:command', this.handler); }
  bookmark(): void { const wc = this.tabs.activeContents(); if (wc && !wc.isDestroyed()) this.library.bookmark(wc.getURL(), wc.getTitle()); }
  emit(): void {
    const wc = this.window?.webContents;
    if (wc && !wc.isDestroyed() && wc.getURL() === MANAGER_URL) wc.send('manager:state', { ...this.library.snapshot(), storage: this.library.status, downloads: this.downloads.snapshot(),updates:this.updates.snapshot(), message: this.message, busy: this.busy });
  }
  open(section = 'bookmarks'): void {
    if (this.window && !this.window.isDestroyed()) { this.window.show(); this.window.focus(); this.window.webContents.send('manager:section', section); this.emit(); return; }
    this.window = new BrowserWindow({ parent: this.parent, width: 900, height: 720, minWidth: 600, minHeight: 450, title: 'ButterToast 관리', autoHideMenuBar: true,
      webPreferences: { ...WEB_PREFERENCES, session: this.parent.webContents.session, preload: path.join(__dirname, '..', 'manager-preload.js') } });
    const wc = this.window.webContents;
    wc.setWindowOpenHandler(() => ({ action: 'deny' })); wc.on('will-frame-navigate', e => e.preventDefault()); wc.on('will-redirect', e => e.preventDefault()); wc.on('will-attach-webview', e => e.preventDefault());
    wc.once('did-finish-load', () => { if (!wc.isDestroyed()) wc.send('manager:section', section); this.emit(); });
    this.window.on('closed', () => { this.window = undefined; });
    void this.window.loadURL(MANAGER_URL).catch(() => {});
  }
  private async clearSiteData(): Promise<void> {
    if (!this.window || this.window.isDestroyed()) return;
    this.busy = true;
    try {
      const answer = await dialog.showMessageBox(this.window, { type: 'warning', message: '웹사이트 쿠키·저장소·캐시를 지울까요?', detail: '사람 탭을 종료하고 다운로드를 취소합니다. 입력 내용이 사라지고 웹사이트에서 로그아웃될 수 있습니다. ButterToast 계정과 AI 작업 창·API 키는 별도로 관리됩니다.', buttons: ['취소', '삭제'], defaultId: 0, cancelId: 0 });
      if (answer.response === 1) { const browsing = session.fromPartition('persist:human');this.tabs.suspendAll();this.downloads.cancelAll();await browsing.closeAllConnections();await browsing.clearAuthCache(); await browsing.clearStorageData(); await browsing.clearCache(); this.message = '웹사이트 데이터를 지웠습니다.'; }
    } catch { this.message = '사이트 데이터 삭제에 실패했습니다.'; } finally { this.busy = false; this.emit(); }
  }
  dispose(): void { ipcMain.removeListener('manager:command', this.handler); this.window?.destroy(); }
}
