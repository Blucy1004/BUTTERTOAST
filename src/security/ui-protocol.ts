import { Session } from 'electron';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
export const UI_URL = 'toast-ui://app/index.html';
export const UI_CSP = "default-src 'none'; script-src 'self'; style-src 'self'; base-uri 'none'; form-action 'none'; frame-src 'none'; frame-ancestors 'none'; object-src 'none'; connect-src 'none'";
const files = new Map([
  ['/index.html', 'text/html'], ['/style.css', 'text/css'], ['/ui.js', 'text/javascript'],
  ['/tabs.js', 'text/javascript'], ['/toolbar.js', 'text/javascript']
]);
export function assetForRequest(url: string, method: string): { name: string; type: string } | null {
  try {
    const parsed = new URL(url);
    if (method !== 'GET' || parsed.origin !== 'null' && parsed.origin !== 'toast-ui://app') return null;
    if (parsed.protocol !== 'toast-ui:' || parsed.host !== 'app' || parsed.username || parsed.password || parsed.search || parsed.hash) return null;
    const type = files.get(parsed.pathname);
    return type ? { name: parsed.pathname.slice(1), type } : null;
  } catch { return null; }
}
export function installUiProtocol(ses: Session, directory: string): void {
  ses.protocol.handle('toast-ui', async request => {
    const asset = assetForRequest(request.url, request.method);
    if (!asset) return new Response(null, { status: 403 });
    try {
      return new Response(await readFile(path.join(directory, asset.name)), { headers: {
        'Content-Type': `${asset.type}; charset=utf-8`, 'Content-Security-Policy': UI_CSP,
        'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-store'
      }});
    } catch { return new Response(null, { status: 404 }); }
  });
  ses.webRequest.onBeforeRequest((details, callback) => callback({ cancel: !assetForRequest(details.url, details.method) }));
}
