import { BrowserWindow, ipcMain, session } from 'electron';
import path from 'node:path';
import { WEB_PREFERENCES, hardenSession } from '../security/electron';
import { RateGate } from '../security/ipc';
import { AuthApi } from './api';
import { parseAuthConfig, PROJECT_URL, PUBLISHABLE_KEY } from './config';
import { AuthService } from './service';
import { parseAuthCommand } from './protocol';
import { UiAppearance } from '../profile/appearance';
export const ACCOUNT_URL = 'toast-ui://app/account.html';
export class AccountWindow {
  private window?: BrowserWindow;
  private service: AuthService;
  private gate = new RateGate();
  private handler: (event: Electron.IpcMainEvent, input: unknown) => void;
  constructor(private parent: BrowserWindow, changed: () => void,private appearance?:UiAppearance) {
    const config = parseAuthConfig(process.env.BUTTERTOAST_SUPABASE_URL ?? PROJECT_URL,
      process.env.BUTTERTOAST_SUPABASE_PUBLISHABLE_KEY ?? PUBLISHABLE_KEY);
    const network = session.fromPartition('toast-auth-network'); hardenSession(network);
    network.webRequest.onBeforeRequest((details, callback) => {
      const url = new URL(details.url);
      const expected:Record<string,string[]>={'/auth/v1/signup':['POST'],'/auth/v1/token':['POST'],'/auth/v1/logout':['POST'],'/auth/v1/recover':['POST'],'/auth/v1/user':['GET','PUT'],'/auth/v1/reauthenticate':['GET']};
      callback({ cancel: !config || url.origin !== config.origin || !expected[url.pathname]?.includes(details.method) });
    });
    this.service = new AuthService(config ? new AuthApi(config, (url, options) => network.fetch(url, options)) : null, () => {
      this.emit(); changed();
    });
    this.handler = (event, input) => {
      const wc = this.window?.webContents;
      if (!wc || wc.isDestroyed() || event.sender !== wc || event.senderFrame !== wc.mainFrame || event.senderFrame?.url !== ACCOUNT_URL) return;
      const command = parseAuthCommand(input);
      if(command?.type==='logout'){void this.service.command(command);return;}
      if(!this.gate.allow())return;
      if (command) void this.service.command(command);
    };
    ipcMain.on('account:command', this.handler);
  }
  signedIn(): boolean { return this.service.publicState().status === 'signed-in'; }
  profile(){const state=this.service.publicState();return state.status==='signed-in'?state.profile:null;}
  busy():boolean {return this.service.publicState().busy;}
  async changeTheme(theme:'dark'|'light'):Promise<boolean> {
    const state=this.service.publicState();if(state.status!=='signed-in'||!state.profile||state.busy)return false;
    await this.service.command({type:'profile-save',revision:state.profileRevision,profile:{...state.profile,appearance:{...state.profile.appearance,theme}}});
    return this.service.publicState().status==='signed-in'&&this.service.publicState().profile?.appearance.theme===theme;
  }
  private emit(): void {
    const wc = this.window?.webContents;
    if (wc && !wc.isDestroyed() && wc.getURL() === ACCOUNT_URL) wc.send('account:state', this.service.publicState());
  }
  open(): void {
    if (this.window && !this.window.isDestroyed()) { this.window.show(); this.window.focus(); return; }
    this.window = new BrowserWindow({ parent: this.parent, width: 760, height: 820, minWidth: 420, minHeight: 600,
      title: 'ButterToast 프로필 · 설정', autoHideMenuBar: true, backgroundColor: this.appearance?.state().resolved==='light'?'#f5f7fc':'#0d1732', webPreferences: {
        ...WEB_PREFERENCES, session: this.parent.webContents.session, preload: path.join(__dirname, '..', 'account-preload.js')
      }});
    const wc = this.window.webContents;
    this.appearance?.register(wc,ACCOUNT_URL);
    wc.setWindowOpenHandler(() => ({ action: 'deny' }));
    wc.on('will-frame-navigate', e => e.preventDefault()); wc.on('will-redirect', e => e.preventDefault());
    wc.on('will-attach-webview', e => e.preventDefault());
    this.window.on('closed', () => { this.window = undefined; });
    void this.window.loadURL(ACCOUNT_URL).catch(() => {});
  }
  dispose(): void {
    ipcMain.removeListener('account:command', this.handler); this.service.dispose(); this.window?.destroy(); this.window = undefined;
  }
}
