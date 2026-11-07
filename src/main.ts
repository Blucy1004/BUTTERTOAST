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
function emitState(): void {
  if (!window || window.isDestroyed() || !tabs) return;
  const state = tabs.state();
  window.webContents.send('browser:state', { ...state, initialized, sessionStatus: store?.status || 'unavailable', privacyEnabled: privacy.enabled(state.url) });
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
    case 'new': tabs.newTab(); focusAddress(); break;
    case 'select': tabs.select(cmd.id); break;
    case 'close': tabs.close(cmd.id); break;
    case 'move': tabs.move(cmd.id, cmd.delta); break;
    case 'reopen': tabs.reopen(); break;
    case 'restart': tabs.restart(); break;
    case 'suspend': tabs.suspend(); break;
    case 'navigate': {
      const url = resolveAddress(cmd.address);
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
  const browsing = session.fromPartition('persist:human');
  hardenSession(browsing); privacy = installPrivacy(browsing);
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
  store = new TabSessionStore(path.join(app.getPath('userData'), 'tabs.enc'), osCipher, emitState);
  tabs = new BrowserTabs(window, { changed: emitState, persist: snapshot => { void store.save(snapshot); }, input: keyboard });
  window.on('resize', () => tabs.layout());
  window.on('closed', () => { initialized = false; tabs.dispose(); });
  void window.loadURL(UI_URL);
  const saved = await store.load();
  if (window.isDestroyed()) return;
  tabs.initialize(saved); initialized = true; emitState();
}).catch(() => { console.error('Browser initialization failed'); app.quit(); });
let flushed = false;
app.on('before-quit', event => {
  if (flushed || !store) return;
  event.preventDefault(); initialized = false;
  void store.flush().finally(() => { flushed = true; app.quit(); });
});
app.on('window-all-closed', () => app.quit());
