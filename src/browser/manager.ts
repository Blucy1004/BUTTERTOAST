import { BrowserWindow, dialog, ipcMain, session } from 'electron';
import path from 'node:path';
import {open,writeFile} from 'node:fs/promises';
import {parseImport,exportBookmarks,ImportKind} from './import';
import {productState,supportDestination} from '../product/access';
import { BrowserTabs } from './tabs';
import { BrowserLibrary } from './library';
import { DownloadManager } from './downloads';
import { RateGate } from '../security/ipc';
import { WEB_PREFERENCES } from '../security/electron';
import { parseManagerCommand } from './manager-protocol';
import { openDefaultBrowserSettings } from './default-browser';
import {BrowserUpdates} from './updates';
import { UiAppearance } from '../profile/appearance';
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
      case 'support-open':{const url=supportDestination(command.id);if(url){this.tabs.newTab(url);this.parent.focus();}break;}
      case 'import':void this.importData(command.kind);break;
      case 'export':void this.exportData(command.kind);break;
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
  constructor(private parent: BrowserWindow, private tabs: BrowserTabs, private library: BrowserLibrary, private downloads: DownloadManager, private changedSettings: () => void,private updates:BrowserUpdates,private appearance?:UiAppearance) { ipcMain.on('manager:command', this.handler); }
  bookmark(): void { const wc = this.tabs.activeContents(); if (wc && !wc.isDestroyed()) this.library.bookmark(wc.getURL(), wc.getTitle()); }
  emit(): void {
    const wc = this.window?.webContents;
    if (wc && !wc.isDestroyed() && wc.getURL() === MANAGER_URL) wc.send('manager:state', { ...this.library.snapshot(),product:productState(), storage: this.library.status, downloads: this.downloads.snapshot(),downloadStorage:this.downloads.storageStatus(),updates:this.updates.snapshot(), message: this.message, busy: this.busy });
  }
  open(section = 'bookmarks'): void {
    if (this.window && !this.window.isDestroyed()) { this.window.show(); this.window.focus(); this.window.webContents.send('manager:section', section); this.emit(); return; }
    this.window = new BrowserWindow({ parent: this.parent, width: 900, height: 720, minWidth: 600, minHeight: 450, title: 'ButterToast 관리', autoHideMenuBar: true,backgroundColor:this.appearance?.state().resolved==='light'?'#f5f7fc':'#0d1732',
      webPreferences: { ...WEB_PREFERENCES, session: this.parent.webContents.session, preload: path.join(__dirname, '..', 'manager-preload.js') } });
    const wc = this.window.webContents;
    this.appearance?.register(wc,MANAGER_URL);
    wc.setWindowOpenHandler(() => ({ action: 'deny' })); wc.on('will-frame-navigate', e => e.preventDefault()); wc.on('will-redirect', e => e.preventDefault()); wc.on('will-attach-webview', e => e.preventDefault());
    wc.once('did-finish-load', () => { if (!wc.isDestroyed()) wc.send('manager:section', section); this.emit(); });
    this.window.on('closed', () => { this.window = undefined; });
    void this.window.loadURL(MANAGER_URL).catch(() => {});
  }
  private async importData(kind:ImportKind):Promise<void> {
    const window=this.window;if(!window||window.isDestroyed()||this.busy)return;this.busy=true;this.emit();
    try {
      const chosen=await dialog.showOpenDialog(window,{title:kind==='bookmarks'?'Chrome에서 내보낸 북마크 HTML 선택':kind==='history'?'Google Takeout BrowserHistory.json 선택':'ButterToast 설정 JSON 선택',properties:['openFile'],filters:[{name:kind==='bookmarks'?'HTML':'JSON',extensions:[kind==='bookmarks'?'html':'json']}]});
      if(chosen.canceled||chosen.filePaths.length!==1||window.isDestroyed())return;
      const file=await open(chosen.filePaths[0],'r');let text:string;
      try{if(!(await file.stat()).isFile()||(await file.stat()).size>2*1024*1024)throw Error();text=await file.readFile('utf8');}finally{await file.close();}
      const parsed=parseImport(kind,text);
      const approval=await dialog.showMessageBox(window,{type:'question',message:kind==='settings'?'가져온 설정을 적용할까요?':`${parsed.entries.length}개 항목을 가져올까요?`,detail:`${parsed.skipped}개 항목은 형식·중복·한도 때문에 제외했습니다. 기존 항목은 유지하며 저장 한도에서 멈춥니다. 파일 안의 스크립트와 외부 리소스는 실행하지 않습니다.`,buttons:['취소','가져오기'],defaultId:0,cancelId:0,noLink:true});
      if(approval.response!==1||window.isDestroyed())return;
      if(kind==='settings'&&parsed.settings){this.library.configure(parsed.settings);this.changedSettings();this.message='설정을 가져왔습니다.';}
      else if(kind!=='settings')this.message=`${this.library.importEntries(kind,parsed.entries)}개 항목을 가져왔습니다. 비밀번호와 쿠키는 가져오지 않습니다.`;
    }catch{this.message='내보내기 파일을 읽지 못했습니다. 북마크 HTML 또는 Google Takeout 방문 기록 JSON과 2 MiB 한도를 확인하세요.';}finally{this.busy=false;this.emit();}
  }
  private async exportData(kind:'bookmarks'|'settings'):Promise<void> {
    const window=this.window;if(!window||window.isDestroyed()||this.busy)return;this.busy=true;this.emit();
    try {
      const chosen=await dialog.showSaveDialog(window,{title:'이 파일은 평문입니다. 공유할 때 사이트 주소에 주의하세요.',defaultPath:kind==='bookmarks'?'ButterToast-bookmarks.html':'ButterToast-settings.json',filters:[{name:kind==='bookmarks'?'HTML':'JSON',extensions:[kind==='bookmarks'?'html':'json']}]});
      if(chosen.canceled||!chosen.filePath||window.isDestroyed())return;
      const data=this.library.snapshot(),text=kind==='bookmarks'?exportBookmarks(data.bookmarks):JSON.stringify({schema:'buttertoast-settings/1',settings:data.settings},null,2);
      await writeFile(chosen.filePath,text,{mode:0o600});this.message='파일로 내보냈습니다. 이 파일은 암호화되지 않은 내보내기 파일입니다.';
    }catch{this.message='내보내기 파일을 저장하지 못했습니다.';}finally{this.busy=false;this.emit();}
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
