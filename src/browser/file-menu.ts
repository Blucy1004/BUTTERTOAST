import { BrowserWindow, Menu, MenuItemConstructorOptions, WebContents } from 'electron';
import { safeDownloadChain } from './download-policy';

/** Only native context-menu actions reach downloadURL; no URL/path IPC is exposed. */
export function showPageMenu(parent: BrowserWindow, wc: WebContents, params: Electron.ContextMenuParams,
  items: MenuItemConstructorOptions[], active: () => boolean): void {
  if (wc.isDestroyed() || parent.isDestroyed() || !active()) return;
  const source = wc.getURL(), frame = wc.mainFrame;
  let revoked = false;
  const revoke = () => { revoked = true; };
  const navigate = (event: { isMainFrame: boolean }) => { if (event.isMainFrame) revoke(); };
  const append = (url: string, label: string) => {
    if (!safeDownloadChain([url], source)) return;
    items.push({ label, click: () => {
      if (revoked || wc.isDestroyed() || wc.isCrashed() || parent.isDestroyed() || !active() || wc.mainFrame !== frame || wc.getURL() !== source) return;
      // DownloadManager still requires native consent and a destination for this exact item.
      try { wc.downloadURL(url); } catch { /* The document/blob may have gone away. */ }
    } });
  };
  append(params.linkURL, '링크를 다른 이름으로 저장');
  if (params.mediaType === 'image') append(params.srcURL, '이미지를 다른 이름으로 저장');
  if (!items.length) return;
  wc.on('did-start-navigation', navigate);wc.on('destroyed', revoke);wc.on('render-process-gone', revoke);
  const cleanup = () => { wc.removeListener('did-start-navigation', navigate);wc.removeListener('destroyed', revoke);wc.removeListener('render-process-gone', revoke); };
  try { Menu.buildFromTemplate(items).popup({ window: parent, callback: cleanup }); } catch { cleanup(); }
}
