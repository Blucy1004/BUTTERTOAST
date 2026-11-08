import { app, BrowserWindow, WebContents, ipcMain, session, protocol } from 'electron';
import path from 'node:path';
import { parseCommand, RateGate } from './security/ipc';
import { assertSafeLaunch, hardenSession, WEB_PREFERENCES } from './security/electron';
import { installUiProtocol, UI_URL } from './security/ui-protocol';
import { osCipher } from './security/os-cipher';
import { BrowserTabs } from './browser/tabs';
import { TabSessionStore } from './browser/session-store';
import { installPrivacy } from './browser/privacy';
import { resolveAddress } from './policy';
import { AccountWindow } from './auth/window';
import { AiWorkspaces } from './ai/workspaces';
import { BrowserLibrary } from './browser/library';
import { BrowserManager } from './browser/manager';
import { DownloadManager } from './browser/downloads';
import { GoogleTheme } from './browser/theme';
import { installSitePermissions } from './browser/permissions';
import {BrowserUpdates} from './browser/updates';
import { isWebUrl } from './policy';

assertSafeLaunch();
app.enableSandbox();
app.commandLine.appendSwitch('site-per-process');
protocol.registerSchemesAsPrivileged([{ scheme: 'toast-ui', privileges: { standard: true, secure: true, supportFetchAPI: true } }]);
const commands = new RateGate();
let window: BrowserWindow;
let tabs: BrowserTabs;
let store: TabSessionStore;
let privacy: ReturnType<typeof installPrivacy>;
let initialized = false;
let account: AccountWindow;
let ai: AiWorkspaces;
let library: BrowserLibrary;
let manager: BrowserManager;
let downloads: DownloadManager;
let updates:BrowserUpdates;
const theme = new GoogleTheme();
const externalUrl = (args: string[]) => args.find(arg => arg.length <= 4096 && /^https?:\/\//i.test(arg) && isWebUrl(arg));
let pendingUrl = app.isPackaged ? externalUrl(process.argv.slice(1)) : undefined;
const singleInstance = app.requestSingleInstanceLock();
if (!singleInstance) app.quit();
app.on('second-instance', (_event, args) => {
  const url = externalUrl(args.slice(1));
  if (initialized && window && !window.isDestroyed()) { if (url) tabs.newTab(url); window.restore(); window.focus(); }
  else if (url) pendingUrl = url;
});
app.on('open-url', (event, url) => { event.preventDefault(); if (isWebUrl(url)) { if (initialized) tabs.newTab(url); else pendingUrl = url; } });
function settingsChanged(): void {
  for (const wc of tabs.allContents()) void theme.apply(wc, library.settings().theme);
  if (!library.settings().restoreTabs) void store.save({ version: 1, active: 0, tabs: [''] });
  else void store.save(tabs.snapshot());
  emitState();
}
function emitState(): void {
  if (!window || window.isDestroyed() || !tabs) return;
  ai?.observe();
  const state = tabs.state();
  window.webContents.send('browser:state', { ...state, initialized, aiSlot:ai?.slot()??1,accountSignedIn: account?.signedIn() ?? false, sessionStatus: store?.status || 'unavailable', privacyEnabled: privacy.enabled(state.url) });
}
function focusAddress(): void {
  window.webContents.focus(); window.webContents.send('browser:focus-address');
}
/** Native input events work even while an untrusted page owns keyboard focus. */
function keyboard(wc: WebContents): void {
  wc.on('before-input-event', (event, input) => {
    if (!initialized || input.type !== 'keyDown' || input.alt) return;
    const key = input.key.toLowerCase(), modifier = process.platform === 'darwin' ? input.meta : input.control;
    let action: (() => void) | undefined;
    if (modifier) {
      if (key === 'l' && !input.shift) action = focusAddress;
      if (key === 'd' && !input.shift) action = () => manager.bookmark();
      if (key === 'h' && !input.shift) action = () => manager.open('history');
      if (key === 'j' && !input.shift) action = () => manager.open('downloads');
      if (key === 't') action = input.shift ? () => tabs.reopen() : () => { tabs.newTab(); focusAddress(); };
      if (key === 'w' && !input.shift) action = () => tabs.close();
      if (key === 'tab') action = () => tabs.cycle(input.shift ? -1 : 1);
      if (/^[1-9]$/.test(key) && !input.shift) action = () => tabs.selectNumber(Number(key));
      if (input.shift && ['pageup', 'pagedown'].includes(key)) action = () => tabs.move(tabs.state().active, key === 'pageup' ? -1 : 1);
      if (key === 'r' && !input.shift) action = () => tabs.history('reload');
    } else if (!input.shift && !input.meta && !input.control) {
      if (key === 'f5') action = () => tabs.history('reload');
      if (key === 'escape') action = () => tabs.history('stop');
    }
    if (action) { event.preventDefault(); if (commands.allow()) action(); }
  });
}
function trusted(event: Electron.IpcMainEvent): boolean {
  return !!window && !window.isDestroyed() && event.sender === window.webContents && event.senderFrame === window.webContents.mainFrame && event.senderFrame?.url === UI_URL;
}
ipcMain.on('browser:command', (event, input: unknown) => {
  if (!trusted(event) || !commands.allow()) return;
  const cmd = parseCommand(input);
  if (!cmd) return;
  if (cmd.type === 'ready') { emitState(); return; }
  if (!initialized) return;
  switch (cmd.type) {
    case 'ai-next':ai.next();emitState();break;
    case 'manager-open': manager.open(); break;
    case 'bookmark': manager.bookmark(); break;
    case 'ai-toggle': ai.toggle(); break;
    case 'account-open': account.open(); break;
    case 'new': tabs.newTab(); focusAddress(); break;
    case 'select': tabs.select(cmd.id); break;
    case 'close': tabs.close(cmd.id); break;
    case 'move': tabs.move(cmd.id, cmd.delta); break;
    case 'reopen': tabs.reopen(); break;
    case 'restart': tabs.restart(); break;
    case 'suspend': tabs.suspend(); break;
    case 'navigate': {
      const url = resolveAddress(cmd.address, library.settings().search);
      if (url) tabs.navigate(url);
      else tabs.setError('지원하지 않는 주소입니다. HTTP 또는 HTTPS 주소를 입력하세요.');
      break;
    }
    case 'privacy-toggle': {
      const url = tabs.state().url;
      if (/^https?:/.test(url)) privacy.setException(url, privacy.enabled(url));
      emitState(); break;
    }
    case 'back': case 'forward': case 'reload': case 'stop': tabs.history(cmd.type); break;
  }
});
app.whenReady().then(async () => {
  if (!singleInstance) return;
  const browsing = session.fromPartition('persist:human');
  privacy = installPrivacy(browsing);
  const uiSession = session.fromPartition('toast-ui');
  hardenSession(uiSession); installUiProtocol(uiSession, __dirname);
  window = new BrowserWindow({ width: 1280, height: 850, minWidth: 600, minHeight: 400,
    title: 'ButterToast', backgroundColor: '#fff', webPreferences: {
      ...WEB_PREFERENCES, session: uiSession, preload: path.join(__dirname, 'preload.js')
    }});
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-frame-navigate', event => event.preventDefault());
  window.webContents.on('will-redirect', event => event.preventDefault());
  window.webContents.on('will-attach-webview', event => event.preventDefault());
  keyboard(window.webContents);
  library = new BrowserLibrary(path.join(app.getPath('userData'), 'library.enc'), osCipher, () => manager?.emit());
  await library.load();
  account = new AccountWindow(window, emitState);
  store = new TabSessionStore(path.join(app.getPath('userData'), 'tabs.enc'), osCipher, emitState);
  tabs = new BrowserTabs(window, { changed: emitState, persist: snapshot => { if (library.settings().restoreTabs) void store.save(snapshot); }, input: keyboard,
    visited: (url, title) => library.visit(url, title), loaded: wc => { void theme.apply(wc, library.settings().theme); } });
  downloads = new DownloadManager(window, () => tabs.activeContents(), () => manager?.emit());
  hardenSession(browsing, downloads.accept); installSitePermissions(browsing, window, library, () => tabs.activeContents());
  updates=new BrowserUpdates(window,()=>manager?.emit());
  manager = new BrowserManager(window, tabs, library, downloads, settingsChanged,updates);
  ai = new AiWorkspaces(window, tabs, (origin, operation, outcome) => library.audit(origin, operation, outcome));
  window.on('resize', () => ai.layout());
  window.on('closed', () => { initialized = false;updates.dispose(); manager.dispose(); downloads.dispose(); account.dispose(); ai.dispose(); tabs.dispose(); });
  void window.loadURL(UI_URL);
  const saved = await store.load();
  if (window.isDestroyed()) return;
  tabs.initialize(library.settings().restoreTabs ? saved : null); initialized = true;
  if (pendingUrl) { tabs.navigate(pendingUrl); pendingUrl = undefined; } emitState();
}).catch(() => { console.error('Browser initialization failed'); app.quit(); });
let flushed = false;
app.on('before-quit', event => {
  if (flushed || !store) return;
  event.preventDefault(); initialized = false;
  void Promise.all([store.flush(), library?.flush(),ai?.flush()]).finally(() => { flushed = true; app.quit(); });
});
app.on('window-all-closed', () => app.quit());
