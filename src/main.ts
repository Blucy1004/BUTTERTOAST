import { app, BrowserWindow, WebContentsView, ipcMain, session, protocol } from 'electron';
import path from 'node:path';
import { parseCommand, RateGate } from './security/ipc';
import { assertSafeLaunch, hardenSession, hardenWebContents, WEB_PREFERENCES } from './security/electron';
import { installUiProtocol, UI_URL } from './security/ui-protocol';
import { resolveAddress } from './policy';

assertSafeLaunch();
app.enableSandbox();
app.commandLine.appendSwitch('site-per-process');
protocol.registerSchemesAsPrivileged([{ scheme: 'toast-ui', privileges: { standard: true, secure: true, supportFetchAPI: true } }]);
const commands = new RateGate();
const HEADER_HEIGHT = 116;
type Tab = { id: number; view: WebContentsView; title: string; error: string };
let window: BrowserWindow;
let tabs: Tab[] = [];
let active = 0;
let nextId = 1;

function current(): Tab | undefined { return tabs.find(t => t.id === active); }
function emitState(): void {
  if (!window || window.isDestroyed()) return;
  const tab = current();
  window.webContents.send('browser:state', {
    tabs: tabs.map(t => ({ id: t.id, title: t.title || '새 탭' })), active,
    url: tab?.view.webContents.getURL() || '',
    canBack: tab?.view.webContents.navigationHistory.canGoBack() ?? false,
    canForward: tab?.view.webContents.navigationHistory.canGoForward() ?? false,
    loading: tab?.view.webContents.isLoading() ?? false,
    error: tab?.error || ''
  });
}
function layout(): void {
  if (!window || window.isDestroyed()) return;
  const [width, height] = window.getContentSize();
  for (const t of tabs) t.view.setBounds({ x: 0, y: HEADER_HEIGHT, width, height: Math.max(0, height - HEADER_HEIGHT) });
}
function select(id: number): void {
  const tab = tabs.find(t => t.id === id);
  if (!tab) return;
  for (const t of tabs) t.view.setVisible(t === tab);
  active = id; layout(); emitState();
}
function newTab(): void {
  if (tabs.length >= 30) return;
  const view = new WebContentsView({ webPreferences: {
    ...WEB_PREFERENCES, partition: 'persist:human'
  }});
  const tab: Tab = { id: nextId++, view, title: '새 탭', error: '' };
  tabs.push(tab);
  window.contentView.addChildView(view);
  hardenWebContents(view.webContents);
  view.webContents.on('page-title-updated', (_event, title) => { tab.title = title.slice(0, 120); emitState(); });
  view.webContents.on('render-process-gone', () => { tab.error = '탭 프로세스가 종료되었습니다. 새로고침하거나 주소를 다시 입력하세요.'; emitState(); });
  view.webContents.on('did-start-loading', () => { tab.error = ''; emitState(); });
  view.webContents.on('did-stop-loading', emitState);
  view.webContents.on('did-navigate', emitState);
  view.webContents.on('did-navigate-in-page', emitState);
  view.webContents.on('did-fail-load', (_event, code, _description, _url, mainFrame) => {
    if (mainFrame && code !== -3) { tab.error = `페이지를 불러오지 못했습니다 (${code}). 주소와 연결 상태를 확인하세요.`; emitState(); }
  });
  select(tab.id);
}
function closeTab(id: number): void {
  const index = tabs.findIndex(t => t.id === id);
  if (index < 0) return;
  const [tab] = tabs.splice(index, 1);
  window.contentView.removeChildView(tab.view);
  tab.view.webContents.close();
  if (!tabs.length) newTab();
  else if (id === active) select(tabs[Math.min(index, tabs.length - 1)].id);
  else emitState();
}
function trusted(event: Electron.IpcMainEvent): boolean {
  return !!window && !window.isDestroyed() && event.sender === window.webContents && event.senderFrame === window.webContents.mainFrame && event.senderFrame?.url === UI_URL;
}
ipcMain.on('browser:command', (event, input: unknown) => {
  if (!trusted(event) || !commands.allow()) return;
  const cmd = parseCommand(input);
  if (!cmd) return;
  const tab = current();
  switch (cmd.type) {
    case 'ready': emitState(); break;
    case 'new': newTab(); break;
    case 'select': if (Number.isSafeInteger(cmd.id)) select(cmd.id as number); break;
    case 'close': if (Number.isSafeInteger(cmd.id)) closeTab(cmd.id as number); break;
    case 'navigate': {
      if (typeof cmd.address !== 'string' || !tab) break;
      const url = resolveAddress(cmd.address);
      if (url) void tab.view.webContents.loadURL(url).catch(() => {});
      else { tab.error = '지원하지 않는 주소입니다. HTTP 또는 HTTPS 주소를 입력하세요.'; emitState(); }
      break;
    }
    case 'back': if (tab?.view.webContents.navigationHistory.canGoBack()) tab.view.webContents.navigationHistory.goBack(); break;
    case 'forward': if (tab?.view.webContents.navigationHistory.canGoForward()) tab.view.webContents.navigationHistory.goForward(); break;
    case 'reload': tab?.view.webContents.reload(); break;
  }
});
app.whenReady().then(() => {
  const browsing = session.fromPartition('persist:human');
  hardenSession(browsing);
  const uiSession = session.fromPartition('toast-ui');
  hardenSession(uiSession);
  installUiProtocol(uiSession, __dirname);
  window = new BrowserWindow({ width: 1280, height: 850, minWidth: 600, minHeight: 400,
    title: 'ButterToast', backgroundColor: '#fff', webPreferences: {
      ...WEB_PREFERENCES, session: uiSession, preload: path.join(__dirname, 'preload.js')
    }});
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-frame-navigate', event => event.preventDefault());
  window.webContents.on('will-redirect', event => event.preventDefault());
  window.webContents.on('will-attach-webview', event => event.preventDefault());
  window.on('resize', layout);
  window.on('closed', () => { for (const t of tabs) if (!t.view.webContents.isDestroyed()) t.view.webContents.close(); tabs = []; });
  void window.loadURL(UI_URL);
  newTab();
});
app.on('window-all-closed', () => app.quit());
