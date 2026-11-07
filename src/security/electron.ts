import { app, WebContents, Session, WebPreferences } from 'electron';
import { isWebUrl } from '../policy';
export const WEB_PREFERENCES: WebPreferences = Object.freeze({
  sandbox: true, contextIsolation: true, nodeIntegration: false,
  nodeIntegrationInSubFrames: false, nodeIntegrationInWorker: false,
  webSecurity: true, allowRunningInsecureContent: false, webviewTag: false,
  navigateOnDragDrop: false, safeDialogs: true, spellcheck: false
});
export function assertSafeLaunch(): void {
  for (const flag of ['no-sandbox', 'disable-web-security', 'ignore-certificate-errors', 'disable-site-isolation-trials', 'disable-site-isolation-for-policy', 'remote-debugging-port', 'remote-debugging-pipe', 'inspect', 'inspect-brk']) {
    if (app.commandLine.hasSwitch(flag)) throw new Error('Unsafe Chromium launch configuration');
  }
  if (app.commandLine.hasSwitch('disable-features')) throw new Error('Disabling Chromium features is unsupported');
}
export function hardenSession(ses: Session): void {
  ses.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
  ses.setPermissionCheckHandler(() => false);
  ses.setDevicePermissionHandler(() => false);
  ses.setDisplayMediaRequestHandler((_request, callback) => callback({}));
  ses.on('will-download', event => event.preventDefault());
}
export function hardenWebContents(wc: WebContents): void {
  let navigatingFromHttps = false;
  wc.on('did-start-navigation', event => {
    if (event.isMainFrame) navigatingFromHttps = event.url.startsWith('https:');
  });
  wc.setWindowOpenHandler(() => ({ action: 'deny' }));
  wc.on('will-attach-webview', event => event.preventDefault());
  wc.on('will-frame-navigate', event => {
    if (!isWebUrl(event.url) && event.url !== 'about:blank') event.preventDefault();
    if (wc.getURL().startsWith('https:') && event.url.startsWith('http:')) event.preventDefault();
  });
  wc.on('will-redirect', event => {
    if (!isWebUrl(event.url) || ((navigatingFromHttps || wc.getURL().startsWith('https:')) && event.url.startsWith('http:'))) event.preventDefault();
    if (event.isMainFrame && event.url.startsWith('https:')) navigatingFromHttps = true;
  });
  // A malicious beforeunload handler must not retain a closed tab.
  wc.on('will-prevent-unload', event => event.preventDefault());
}
