import { Session } from 'electron';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
export const UI_URL = 'toast-ui://app/index.html';
export const UI_CSP = "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; font-src 'self'; base-uri 'none'; form-action 'none'; frame-src 'none'; frame-ancestors 'none'; object-src 'none'; connect-src 'none'";
const files = new Map([
  ['/icons.js','text/javascript'],['/appearance.js','text/javascript'],['/profile.js','text/javascript'],
  ['/fonts/PretendardVariable.woff2', 'font/woff2'],
  ['/workspace.js', 'text/javascript'], ['/starfield.png', 'image/png'], ['/cursor.html', 'text/html'], ['/cursor.css', 'text/css'],
  ['/manager.html', 'text/html'], ['/manager.css', 'text/css'], ['/manager.js', 'text/javascript'],
  ['/index.html', 'text/html'], ['/style.css', 'text/css'], ['/ui.js', 'text/javascript'],
  ['/ai.html', 'text/html'], ['/ai.js', 'text/javascript'], ['/ai.css', 'text/css'], ['/ai-settings.js', 'text/javascript'],
  ['/account.html', 'text/html'], ['/account.js', 'text/javascript'], ['/account.css', 'text/css'], ['/tokens.css', 'text/css'],
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
