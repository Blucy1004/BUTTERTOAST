import { app, BrowserWindow, WebContents, ipcMain, session, protocol, Menu } from 'electron';
import path from 'node:path';
import {readFileSync} from 'node:fs';
import { parseCommand, RateGate, record } from './security/ipc';
import { assertSafeLaunch, hardenSession, WEB_PREFERENCES } from './security/electron';
import { installUiProtocol, UI_URL } from './security/ui-protocol';
import { osCipher } from './security/os-cipher';
import { BrowserTabs } from './browser/tabs';
import { TabSessionStore } from './browser/session-store';
import { installPrivacy } from './browser/privacy';
import { resolveAddress } from './policy';
import {AccountStorage} from './auth/storage';
import { AccountWindow } from './auth/window';
import { AiWorkspaces } from './ai/workspaces';
import { BrowserLibrary } from './browser/library';
import { BrowserManager } from './browser/manager';
import {DownloadStore} from './browser/download-store';
import { DownloadManager } from './browser/downloads';
import { showPageMenu } from './browser/file-menu';
import { GoogleTheme } from './browser/theme';
import { installSitePermissions } from './browser/permissions';
import {BrowserUpdates} from './browser/updates';
import { isWebUrl } from './policy';
import { defaultWorkspace, workspaceGeometry } from './browser/workspace';
import { addressSuggestions } from './browser/suggestions';
import { PopupPolicy } from './browser/popups';
import { BrowserWindows } from './browser/windows';
import { TabMenu } from './browser/tab-menu';
import { UiAppearance } from './profile/appearance';

assertSafeLaunch();
const appVersion=JSON.parse(readFileSync(path.join(__dirname,'..','package.json'),'utf8')).version as string;
app.enableSandbox();
app.commandLine.appendSwitch('site-per-process');
protocol.registerSchemesAsPrivileged([{ scheme: 'toast-ui', privileges: { standard: true, secure: true, supportFetchAPI: true } }]);
const commands = new RateGate();
const suggestionCommands=new RateGate(10,15);
const resizeCommands = new RateGate(8,30);
let window: BrowserWindow;
let tabs: BrowserTabs;
let store: TabSessionStore;
let privacy: ReturnType<typeof installPrivacy>;
let initialized = false;
let account: AccountWindow;
let accountStorage:AccountStorage;
let ai: AiWorkspaces;
let tabMenu:TabMenu;
let extraWindows:BrowserWindows;
let popups:PopupPolicy;
let library: BrowserLibrary;
let manager: BrowserManager;
let appearance:UiAppearance;
let appearanceMessage='';
let downloads: DownloadManager;
let updates:BrowserUpdates;
let workspace=defaultWorkspace(), narrowToast=false, arranging=false, workspaceDirty=false;
let arrangeTimer:NodeJS.Timeout|undefined;
// Native keyboard input only. DOM keyboard dispatch cannot trigger this emergency path.
app.on('web-contents-created',(_event,wc)=>wc.on('before-input-event',(event,input)=>{
  const modifier=process.platform==='darwin'?input.meta:input.control;
  if(input.type==='keyDown'&&modifier&&input.shift&&!input.alt&&input.key.toLowerCase()==='x'){
    event.preventDefault();ai?.stopAll();
  }
}));
function layoutWorkspace():ReturnType<typeof workspaceGeometry> {
  const [width,height]=window.getContentSize(),layout=workspaceGeometry(width,height,workspace,narrowToast,tabs?.state().find.open);
  tabs?.setViewport(layout.human,layout.browserVisible&&!arranging);
  ai?.setPresentation(layout.toast,layout.toastVisible&&!arranging);
  return layout;
}
function saveWorkspace():void {library.configureWorkspace(workspace);emitState();}
function endArrange():void {clearTimeout(arrangeTimer);arranging=false;if(workspaceDirty){workspaceDirty=false;library?.configureWorkspace(workspace);}emitState();}
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
  tabs.configureMemorySaver(library.settings().memorySaver);
  for (const wc of tabs.allContents()) void theme.apply(wc, library.settings().theme);
  if (!library.settings().restoreTabs) void store.save({ version: 1, active: 0, tabs: [''] });
  else void store.save(tabs.snapshot());
  emitState();
}
function updateAppearance():void {if(appearance&&library)appearance.set(account?.profile()?.appearance??library.appearance());}
function accountChanged():void {appearanceMessage='';updateAppearance();emitState();}
async function cycleTheme():Promise<void> {
  if(account.busy())return;
  const next=appearance.state().resolved==='light'?'dark':'light';appearanceMessage='';
  if(account.signedIn()){
    if(!await account.changeTheme(next))appearanceMessage='테마를 저장하지 못했어요. 프로필 설정에서 확인해 주세요.';
  }else{
    library.configureAppearance({...library.appearance(),theme:next});updateAppearance();
    if(library.status!=='available')appearanceMessage='이번 실행에 적용했어요. 기기 보호 저장소를 사용할 수 없어 종료 후에는 유지되지 않아요.';
  }
  emitState();
}
function emitState(): void {
  if (!window || window.isDestroyed() || !tabs) return;
  ai?.observe();
  const state = tabs.state();
  const profile=account?.profile();
  window.webContents.send('browser:state', { ...state,popupBlocked:popups?.blocked(tabs.activeContents())??false,version:appVersion, layout:layoutWorkspace(),workspace, initialized, aiSlot:ai?.slot()??1,accountSignedIn: account?.signedIn() ?? false,accountProfile:profile?{name:profile.name,avatar:profile.avatar}:null,accountBusy:account?.busy()??false,appearanceMessage, sessionStatus: store?.status || 'unavailable', privacyEnabled: privacy.enabled(state.url) });
}
function focusAddress(): void {
  window.webContents.focus(); window.webContents.send('browser:focus-address');
}
function focusTools(tool:'find'|'tabs'):void {
  if(tool==='find'){narrowToast=false;tabs.openFind();}
  else {workspace.leftCollapsed=false;emitState();}
  window.webContents.focus();window.webContents.send('browser:focus-tools',tool);
}
/** Native input events work even while an untrusted page owns keyboard focus. */
function keyboard(wc: WebContents): void {
  if(wc!==window?.webContents){
    popups?.attach(wc);
    wc.on('context-menu',(_event,params)=>{
      if(!isWebUrl(wc.getURL()))return;
      const items:Electron.MenuItemConstructorOptions[]=[];
      if(isWebUrl(params.linkURL)&&params.linkURL.length<=4096){const url=params.linkURL;items.push({label:'링크를 새 탭에서 열기',click:()=>tabs.newTab(url)},{label:'링크를 새 창에서 열기',click:()=>extraWindows.open(url)});}
      if(params.isEditable)items.push({role:'undo'},{role:'redo'},{type:'separator'},{role:'cut'},{role:'copy'},{role:'paste'},{role:'selectAll'});
      else if(params.selectionText)items.push({role:'copy'});
      showPageMenu(window,wc,params,items,()=>tabs.activeContents()===wc);
    });
  }
  wc.on('before-input-event', (event, input) => {
    if (!initialized || input.type !== 'keyDown' || input.alt) return;
    const key = input.key.toLowerCase(), modifier = process.platform === 'darwin' ? input.meta : input.control;
    let action: (() => void) | undefined;
    if (modifier) {
      if (key === 'n'&&!input.shift) action=()=>extraWindows.open();
      if (key === 'l' && !input.shift) action = focusAddress;
      if (key === 'f' && !input.shift) action = () => focusTools('find');
      if (key === 'a' && input.shift) action = () => focusTools('tabs');
      if (['+','='].includes(key)) action = () => tabs.zoom(1);
      if (key === '-') action = () => tabs.zoom(-1);
      if (key === '0') action = () => tabs.zoom(0);
      if (key === 'd' && !input.shift) action = () => manager.bookmark();
      if (key === 'h' && !input.shift) action = () => manager.open('history');
      if (key === 'j' && !input.shift) action = () => manager.open('downloads');
      if (key === 't') action = input.shift ? () => tabs.reopen() : () => { tabs.newTab(); focusAddress(); };
      if (key === 'w' && !input.shift) action = () => tabs.close();
      if (key === 'tab') action = () => tabs.cycle(input.shift ? -1 : 1);
      if (/^[1-9]$/.test(key) && !input.shift) action = () => tabs.selectNumber(Number(key));
      if (input.shift && ['pageup', 'pagedown'].includes(key)) action = () => tabs.move(tabs.state().active, key === 'pageup' ? -1 : 1);
      if (key === 'r') action = () => tabs.history(input.shift?'reload-hard':'reload');
    } else if (!input.shift && !input.meta && !input.control) {
      if (key === 'f11') action = () => window.setFullScreen(!window.isFullScreen());
      if (key === 'f5') action = () => tabs.history('reload');
      if (key === 'escape') action = () => tabs.state().find.open?tabs.clearFind():tabs.history('stop');
      if (key === 'f3') action = () => tabs.find(tabs.state().find.query,true,true);
    } else if(key==='f3'&&input.shift&&!input.control&&!input.meta){
      action=()=>tabs.find(tabs.state().find.query,false,true);
    }
    if (action) { event.preventDefault(); if (commands.allow()) action(); }
  });
}
function trusted(event: Electron.IpcMainEvent): boolean {
  return !!window && !window.isDestroyed() && event.sender === window.webContents && event.senderFrame === window.webContents.mainFrame && event.senderFrame?.url === UI_URL;
}
ipcMain.on('browser:command', (event, input: unknown) => {
  if (!trusted(event))return;
  if(record(input)&&input.type==='ai-stop-all'&&parseCommand(input)){if(initialized)ai.stopAll();return;}
  if(record(input)&&input.type==='suggest'){
    const cmd=parseCommand(input);if(initialized&&suggestionCommands.allow()&&cmd?.type==='suggest'){const data=library.snapshot();event.sender.send('browser:suggestions',{query:cmd.query,items:addressSuggestions(cmd.query,data.bookmarks,data.history)});}return;
  }
  if (!(record(input)&&input.type==='workspace-resize'?resizeCommands:commands).allow()) return;
  const cmd = parseCommand(input);
  if (!cmd) return;
  if (cmd.type === 'ready') { emitState(); return; }
  if (!initialized) return;
  switch (cmd.type) {
    case 'popup-open':void popups.open(tabs.activeContents());break;
    case 'new-window':extraWindows.open();break;
    case 'theme-cycle':void cycleTheme();break;
    case 'tab-menu':tabMenu.open(cmd.id);break;
    case 'find-open':focusTools('find');break;
    case 'find-close':tabs.clearFind();break;
    case 'find':tabs.find(cmd.text,cmd.forward,cmd.next);break;
    case 'zoom':tabs.zoom(cmd.direction);break;
    case 'delegate': void ai.delegate(cmd.id);break;
    case 'workspace-toggle': {
      if(cmd.side==='left')workspace.leftCollapsed=!workspace.leftCollapsed;
      else {workspace.rightCollapsed=!workspace.rightCollapsed;if(!workspace.rightCollapsed)narrowToast=true;}
      saveWorkspace();break;
    }
    case 'workspace-resize': {
      workspace[cmd.side]=cmd.width;workspaceDirty=true;arranging=true;clearTimeout(arrangeTimer);arrangeTimer=setTimeout(endArrange,1200);emitState();break;
    }
    case 'workspace-resize-end': endArrange();break;
    case 'workspace-drag': arranging=cmd.active;clearTimeout(arrangeTimer);if(arranging)arrangeTimer=setTimeout(endArrange,15000);emitState();break;
    case 'ai-next':ai.next();emitState();break;
    case 'manager-open': manager.open(); break;
    case 'downloads-open': manager.open('downloads'); break;
    case 'bookmark': manager.bookmark(); break;
    case 'ai-toggle': if(workspace.rightCollapsed||!ai.isOpen()||(window.getContentSize()[0]<760&&!narrowToast)){narrowToast=true;ai.open();}else ai.toggle();break;
    case 'account-open': account.open(); break;
    case 'new': tabs.newTab(); focusAddress(); break;
    case 'select': tabs.select(cmd.id); break;
    case 'close': tabs.close(cmd.id); break;
    case 'move': tabs.move(cmd.id, cmd.delta); break;
    case 'reorder':tabs.reorder(cmd.id,cmd.before);break;
    case 'fullscreen':window.setFullScreen(!window.isFullScreen());break;
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
    case 'back': case 'forward': case 'reload': case 'reload-hard': case 'stop': tabs.history(cmd.type); break;
  }
});
app.whenReady().then(async () => {
  if (!singleInstance) return;
  const browsing = session.fromPartition('persist:human');
  privacy = installPrivacy(browsing);
  const uiSession = session.fromPartition('toast-ui');
  hardenSession(uiSession); installUiProtocol(uiSession, __dirname);
  window = new BrowserWindow({ width: 1440, height: 900, minWidth: 600, minHeight: 560, autoHideMenuBar:true,
    title: 'ButterToast', backgroundColor: '#050b1d', webPreferences: {
      ...WEB_PREFERENCES, session: uiSession, preload: path.join(__dirname, 'preload.js')
    }});
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-frame-navigate', event => event.preventDefault());
  window.webContents.on('will-redirect', event => event.preventDefault());
  window.webContents.on('will-attach-webview', event => event.preventDefault());
  keyboard(window.webContents);
  library = new BrowserLibrary(path.join(app.getPath('userData'), 'library.enc'), osCipher, () => {manager?.emit();updateAppearance();});
  await library.load();
  appearance=new UiAppearance();appearance.register(window.webContents,UI_URL);updateAppearance();
  workspace=library.workspace();
  accountStorage=new AccountStorage(path.join(app.getPath('userData'),'account'),osCipher);
  await accountStorage.load().catch(()=>{});
  account = new AccountWindow(window, accountChanged,appearance,accountStorage);
  store = new TabSessionStore(path.join(app.getPath('userData'), 'tabs.enc'), osCipher, emitState);
  popups=new PopupPolicy(window,url=>tabs.newTab(url),emitState);
  tabs = new BrowserTabs(window, { changed: emitState, persist: snapshot => { if (library.settings().restoreTabs) void store.save(snapshot); }, input: keyboard,
    canSuspend:wc=>!library.snapshot().permissions.some(rule=>rule.decision==='allow'&&wc.getURL().startsWith(rule.origin+'/'))&&!downloads?.snapshot().some(item=>['progressing','interrupted'].includes(item.state)&&wc.getURL().startsWith(item.origin+'/')),
    visited: (url, title) => library.visit(url, title), loaded: wc => { void theme.apply(wc, library.settings().theme); } });
  tabs.configureMemorySaver(library.settings().memorySaver);
  downloads = new DownloadManager(window, () => tabs.activeContents(), () => manager?.emit(),new DownloadStore(path.join(app.getPath('userData'),'downloads.enc'),osCipher),wc=>extraWindows?.activeContents(wc)??false);
  await downloads.load();
  hardenSession(browsing, downloads.accept); installSitePermissions(browsing, window, library, () => tabs.activeContents());
  updates=new BrowserUpdates(window,()=>manager?.emit());
  manager = new BrowserManager(window, tabs, library, downloads, settingsChanged,updates,appearance);
  ai = new AiWorkspaces(window, tabs, (origin, operation, outcome) => library.audit(origin, operation, outcome), visible=>{workspace.rightCollapsed=!visible;if(visible)narrowToast=true;saveWorkspace();},appearance);
  extraWindows=new BrowserWindows(window,library,appearance,()=>manager.open('downloads'));
  tabMenu=new TabMenu(window,tabs,id=>{void ai.delegate(id);});
  window.on('resize', () => emitState());
  window.on('blur',endArrange);
  window.on('closed', () => { initialized = false;extraWindows.dispose();updates.dispose(); manager.dispose(); downloads.dispose(); account.dispose(); ai.dispose(); tabs.dispose();appearance.dispose(); });
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
  if(workspaceDirty){workspaceDirty=false;library?.configureWorkspace(workspace);}
  void Promise.all([store.flush(), library?.flush(),ai?.flush(),accountStorage?.flush(),downloads?.flush()]).finally(() => { flushed = true; app.quit(); });
});
app.on('window-all-closed', () => app.quit());
