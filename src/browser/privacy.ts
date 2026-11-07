import { Session, webContents } from 'electron';
import { TRACKER_HOSTS, shouldBlockTracker, privateHeaders } from './privacy-policy';
const installed = new WeakSet<Session>();
export function installPrivacy(ses: Session, roots = TRACKER_HOSTS) {
  if (installed.has(ses)) throw new Error('Privacy handlers already installed');
  installed.add(ses);
  const exceptions = new Set<string>();
  ses.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*', 'ws://*/*', 'wss://*/*'] }, (details, callback) => {
    const page = (details.webContentsId === undefined ? undefined : webContents.fromId(details.webContentsId))?.getURL() || '';
    let exempt = false;
    try { exempt = exceptions.has(new URL(page).origin); } catch { /* no page yet */ }
    callback({ cancel: !exempt && shouldBlockTracker(details.url, page, details.resourceType, roots) });
  });
  ses.webRequest.onBeforeSendHeaders({ urls: ['http://*/*', 'https://*/*'] }, (details, callback) => callback({ requestHeaders: privateHeaders(details.url, details.requestHeaders) }));
  return {
    enabled(page: string): boolean { try { return !exceptions.has(new URL(page).origin); } catch { return true; } },
    setException(page: string, exempt: boolean): void {
      const url = new URL(page);
      if (!['http:', 'https:'].includes(url.protocol)) return;
      if (exempt) exceptions.add(url.origin); else exceptions.delete(url.origin);
    }
  };
}
