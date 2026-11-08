import { dialog, BrowserWindow, Session, WebContents } from 'electron';
import { BrowserLibrary, httpsOrigin, sitePermission } from './library';
/** Human-session only. AI/UI/network sessions retain deny-all handlers. */
export function installSitePermissions(ses: Session, parent: BrowserWindow, library: BrowserLibrary, active: () => WebContents | undefined): void {
  const pending = new Set<string>();
  const originFor = (wc: WebContents | null, requesting: string | undefined, main: boolean | undefined): string | null => {
    if (!wc || wc.isDestroyed() || wc !== active() || main === false || !requesting) return null;
    try { const origin = new URL(requesting).origin; return httpsOrigin(origin) && new URL(wc.getURL()).origin === origin ? origin : null; } catch { return null; }
  };
  ses.setPermissionCheckHandler((wc, permission, origin, details) => {
    const trustedOrigin = originFor(wc, origin, details.isMainFrame);
    return !!trustedOrigin && sitePermission(permission) && library.permission(trustedOrigin, permission) === 'allow';
  });
  ses.setPermissionRequestHandler((wc, permission, callback, details) => {
    const origin = originFor(wc, details.requestingUrl, details.isMainFrame);
    if (!origin || !sitePermission(permission) || parent.isDestroyed()) { callback(false); return; }
    const policy = library.permission(origin, permission);
    if (policy !== 'ask') { callback(policy === 'allow'); return; }
    const token = `${origin}/${permission}`;
    if (pending.size >= 1 || pending.has(token)) { callback(false); return; }
    pending.add(token);
    const frame = wc.mainFrame, url = wc.getURL();
    const names = { geolocation: '위치', notifications: '알림', media: '카메라·마이크' };
    void dialog.showMessageBox(parent, { type: 'question', title: '사이트 권한', message: `${names[permission]} 접근을 허용할까요?`, detail: origin,
      buttons: ['거부', '이번 요청 허용', '이 사이트에서 허용', '이 사이트에서 차단'], defaultId: 0, cancelId: 0, noLink: true }).then(answer => {
        const valid = !wc.isDestroyed() && active() === wc && wc.mainFrame === frame && wc.getURL() === url && !parent.isDestroyed();
        if (valid && (answer.response === 2 || answer.response === 3)) library.setPermission(origin, permission, answer.response === 2 ? 'allow' : 'deny');
        callback(valid && (answer.response === 1 || answer.response === 2));
      }, () => callback(false)).finally(() => pending.delete(token));
  });
}
