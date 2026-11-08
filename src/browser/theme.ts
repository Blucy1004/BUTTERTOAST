import type { WebContents } from 'electron';
import type { Settings } from './library';
export function googleSearch(url: string): boolean {
  try { const u = new URL(url); return u.protocol === 'https:' && !u.username && !u.password && !u.port && ['www.google.com', 'www.google.co.kr', 'google.com', 'google.co.kr'].includes(u.hostname) && u.pathname === '/search'; } catch { return false; }
}
// Cosmetic tokens only. No page JS, result extraction, link/advertisement removal or network resources.
export function themeCss(theme: Settings['theme']): string {
  if (theme === 'off') return '';
  const dark = theme === 'dark';
  return `:root { --bt-page: ${dark ? '#202124' : '#fffdf7'}; --bt-ink: ${dark ? '#e8eaed' : '#202124'}; --bt-link: ${dark ? '#a8c7fa' : '#1a0dab'}; color-scheme: ${dark ? 'dark' : 'light'}; }
    html,body,#search,#rso,#main,#appbar,#top_nav { background-color:var(--bt-page) !important; color:var(--bt-ink) !important; }
    #search a h3 { color:var(--bt-link) !important; }`;
}
export class GoogleTheme {
  private keys = new WeakMap<WebContents, string>();
  private epochs = new WeakMap<WebContents, number>();
  async apply(wc: WebContents, theme: Settings['theme']): Promise<void> {
    if (wc.isDestroyed()) return;
    const epoch = (this.epochs.get(wc) ?? 0) + 1; this.epochs.set(wc, epoch);
    const old = this.keys.get(wc); this.keys.delete(wc);
    try {
      if (old) await wc.removeInsertedCSS(old);
      if (wc.isDestroyed() || this.epochs.get(wc) !== epoch || !googleSearch(wc.getURL()) || theme === 'off') return;
      const url = wc.getURL(), key = await wc.insertCSS(themeCss(theme), { cssOrigin: 'user' });
      if (!wc.isDestroyed() && (this.epochs.get(wc) !== epoch || wc.getURL() !== url)) await wc.removeInsertedCSS(key);
      else this.keys.set(wc, key);
    } catch { /* Navigation can destroy the old document. */ }
  }
}
