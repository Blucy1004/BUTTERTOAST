import { BrowserWindow, ipcMain, session } from 'electron';
import path from 'node:path';
import { WEB_PREFERENCES, hardenSession } from '../security/electron';
import { RateGate } from '../security/ipc';
import { AuthApi } from './api';
import { parseAuthConfig, PROJECT_URL, PUBLISHABLE_KEY } from './config';
import { AuthService } from './service';
import { parseAuthCommand } from './protocol';
export const ACCOUNT_URL = 'toast-ui://app/account.html';
export class AccountWindow {
  private window?: BrowserWindow;
  private service: AuthService;
  private gate = new RateGate();
  private handler: (event: Electron.IpcMainEvent, input: unknown) => void;
  constructor(private parent: BrowserWindow, changed: () => void) {
    const config = parseAuthConfig(process.env.BUTTERTOAST_SUPABASE_URL ?? PROJECT_URL,
      process.env.BUTTERTOAST_SUPABASE_PUBLISHABLE_KEY ?? PUBLISHABLE_KEY);
    const network = session.fromPartition('toast-auth-network'); hardenSession(network);
    network.webRequest.onBeforeRequest((details, callback) => {
      const url = new URL(details.url);
      callback({ cancel: !config || url.origin !== config.origin || details.method !== 'POST'
        || !['/auth/v1/signup', '/auth/v1/token', '/auth/v1/logout'].includes(url.pathname) });
    });
    this.service = new AuthService(config ? new AuthApi(config, (url, options) => network.fetch(url, options)) : null, () => {
      this.emit(); changed();
    });
    this.handler = (event, input) => {
      const wc = this.window?.webContents;
      if (!wc || wc.isDestroyed() || event.sender !== wc || event.senderFrame !== wc.mainFrame || event.senderFrame?.url !== ACCOUNT_URL || !this.gate.allow()) return;
      const command = parseAuthCommand(input); if (command) void this.service.command(command);
    };
    ipcMain.on('account:command', this.handler);
  }
  signedIn(): boolean { return this.service.publicState().status === 'signed-in'; }
  private emit(): void {
    const wc = this.window?.webContents;
    if (wc && !wc.isDestroyed() && wc.getURL() === ACCOUNT_URL) wc.send('account:state', this.service.publicState());
  }
  open(): void {
    if (this.window && !this.window.isDestroyed()) { this.window.show(); this.window.focus(); return; }
    this.window = new BrowserWindow({ parent: this.parent, width: 460, height: 620, minWidth: 360, minHeight: 560,
      title: 'ButterToast 계정', autoHideMenuBar: true, backgroundColor: '#fff', webPreferences: {
        ...WEB_PREFERENCES, session: this.parent.webContents.session, preload: path.join(__dirname, '..', 'account-preload.js')
      }});
    const wc = this.window.webContents;
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
