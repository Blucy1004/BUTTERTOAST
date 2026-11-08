import { mkdir, open, rename, unlink } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { OsCipher } from '../security/vault';
import { exactKeys, record } from '../security/ipc';
import { restorableUrl } from './session-store';

export type Settings = { search: 'google' | 'brave' | 'duckduckgo'; theme: 'off' | 'light' | 'dark'; history: boolean; restoreTabs: boolean };
export type Entry = { id: string; url: string; title: string; time: number };
export type SitePermission = 'geolocation' | 'notifications' | 'media';
export type SiteRule = { origin: string; permission: SitePermission; decision: 'allow' | 'deny' };
export type AuditEntry = { id: string; time: number; origin: string; operation: string; outcome: string };
export type LibraryData = { version: 1; settings: Settings; bookmarks: Entry[]; history: Entry[]; permissions: SiteRule[]; audit: AuditEntry[] };
const defaults = (): LibraryData => ({ version: 1, settings: { search: 'google', theme: 'off', history: true, restoreTabs: true }, bookmarks: [], history: [], permissions: [], audit: [] });
export function httpsOrigin(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 4096) return false;
  try { const u = new URL(value); return u.protocol === 'https:' && !u.username && !u.password && u.origin === value; } catch { return false; }
}
export function parseSettings(value: unknown): Settings | null {
  if (!record(value) || !exactKeys(value, ['search', 'theme', 'history', 'restoreTabs']) || !['google', 'brave', 'duckduckgo'].includes(value.search as string)
    || !['off', 'light', 'dark'].includes(value.theme as string) || typeof value.history !== 'boolean' || typeof value.restoreTabs !== 'boolean') return null;
  return { search: value.search as Settings['search'], theme: value.theme as Settings['theme'], history: value.history, restoreTabs: value.restoreTabs };
}
export function sitePermission(value: unknown): value is SitePermission { return ['geolocation', 'notifications', 'media'].includes(value as string); }
export function parseLibrary(value: unknown): LibraryData | null {
  if (!record(value) || !exactKeys(value, ['version', 'settings', 'bookmarks', 'history', 'permissions', 'audit']) || value.version !== 1) return null;
  const settings = parseSettings(value.settings); if (!settings) return null;
  const entries = (data: unknown, limit: number): data is Entry[] => Array.isArray(data) && data.length <= limit && data.every(e => record(e) && exactKeys(e, ['id', 'url', 'title', 'time'])
    && typeof e.id === 'string' && /^[\w-]{1,80}$/.test(e.id) && typeof e.title === 'string' && e.title.length <= 200 && !!e.url && restorableUrl(e.url) && Number.isSafeInteger(e.time) && (e.time as number) >= 0);
  if (!entries(value.bookmarks, 1000) || !entries(value.history, 3000) || !Array.isArray(value.permissions) || value.permissions.length > 300
    || !value.permissions.every(e => record(e) && exactKeys(e, ['origin', 'permission', 'decision']) && httpsOrigin(e.origin) && sitePermission(e.permission) && ['allow', 'deny'].includes(e.decision as string))
    || !Array.isArray(value.audit) || value.audit.length > 1000 || !value.audit.every(e => record(e) && exactKeys(e, ['id', 'time', 'origin', 'operation', 'outcome'])
      && typeof e.id === 'string' && /^[\w-]{1,80}$/.test(e.id) && Number.isSafeInteger(e.time) && (e.time as number) >= 0 && httpsOrigin(e.origin)
      && typeof e.operation === 'string' && /^[A-Z_]{1,32}$/.test(e.operation) && typeof e.outcome === 'string' && /^[a-z-]{1,64}$/.test(e.outcome))) return null;
  return structuredClone({ ...value, settings }) as LibraryData;
}
/** Main-process metadata only. No plaintext fallback, credentials, form values or AI text. */
export class BrowserLibrary {
  private data = defaults();
  private available = false;
  private writing: Promise<void> | null = null;
  private dirty = false;
  private lastVisit = 0;
  status: 'available' | 'unavailable' | 'failed' = 'unavailable';
  constructor(private file: string, private cipher: OsCipher, private changed: () => void = () => {}) {}
  snapshot(): LibraryData { return structuredClone(this.data); }
  settings(): Settings { return { ...this.data.settings }; }
  async load(): Promise<void> {
    try {
      this.available = await this.cipher.available(); this.status = this.available ? 'available' : 'unavailable';
      if (!this.available) return;
      const handle = await open(this.file, 'r');
      let bytes: Buffer;
      try { if ((await handle.stat()).size > 20 * 1024 * 1024) throw new Error('Size'); bytes = await handle.readFile(); } finally { await handle.close(); }
      const decoded = await this.cipher.decrypt(bytes); if (decoded.length > 18 * 1024 * 1024) throw new Error('Size');
      const parsed = parseLibrary(JSON.parse(decoded)); if (!parsed) throw new Error('Schema'); this.data = parsed;
    } catch (e) { if ((e as NodeJS.ErrnoException).code !== 'ENOENT') this.status = 'failed'; }
  }
  private save(): void {
    this.changed(); if (!this.available) return;
    this.dirty=true;
    if(!this.writing)this.writing=this.drain().finally(()=>{this.writing=null;});
  }
  private async drain():Promise<void>{
    while(this.dirty){
      this.dirty=false;const payload=JSON.stringify(this.data);
      const temp = `${this.file}.${randomUUID()}.tmp`;
      try {
        const bytes = await this.cipher.encrypt(payload);
        await mkdir(path.dirname(this.file), { recursive: true, mode: 0o700 });
        const handle = await open(temp, 'wx', 0o600);
        try { await handle.writeFile(bytes); await handle.sync(); } finally { await handle.close(); }
        await rename(temp, this.file); this.status = 'available';
      } catch { this.status = 'failed'; } finally { await unlink(temp).catch(() => {}); }
      this.changed();
    }
  }
  async flush(): Promise<void> { await this.writing; }
  configure(settings: Settings): void { const parsed = parseSettings(settings); if (!parsed) return; this.data.settings = parsed; this.save(); }
  bookmark(url: string, title: string): void {
    if (!url || !restorableUrl(url) || this.data.bookmarks.some(e => e.url === url) || this.data.bookmarks.length >= 1000) return;
    this.data.bookmarks.unshift({ id: randomUUID(), url, title: title.slice(0, 200), time: Date.now() }); this.save();
  }
  visit(url: string, title: string): void {
    if (!this.data.settings.history || !url || !restorableUrl(url)) return;
    const previous = this.data.history[0];
    if (previous?.url === url && Date.now() - previous.time < 10000) { previous.title = title.slice(0, 200); return; }
    if(Date.now()-this.lastVisit<500)return;this.lastVisit=Date.now();
    this.data.history.unshift({ id: randomUUID(), url, title: title.slice(0, 200), time: Date.now() }); this.data.history.length = Math.min(3000, this.data.history.length); this.save();
  }
  remove(kind: 'bookmarks' | 'history', id: string): void { this.data[kind] = this.data[kind].filter(e => e.id !== id); this.save(); }
  clear(kind: 'history' | 'audit'): void { this.data[kind] = []; this.save(); }
  rename(id: string, title: string): void { const e = this.data.bookmarks.find(e => e.id === id); if (e) { e.title = title.slice(0, 200); this.save(); } }
  permission(origin: string, permission: string): 'allow' | 'deny' | 'ask' { return this.data.permissions.find(e => e.origin === origin && e.permission === permission)?.decision ?? 'ask'; }
  setPermission(origin: string, permission: SitePermission, decision: 'allow' | 'deny' | 'ask'): void {
    if (!httpsOrigin(origin) || !sitePermission(permission) || !['allow', 'deny', 'ask'].includes(decision)) return;
    this.data.permissions = this.data.permissions.filter(e => e.origin !== origin || e.permission !== permission);
    if (decision !== 'ask' && this.data.permissions.length < 300) this.data.permissions.push({ origin, permission, decision }); this.save();
  }
  audit(origin: string, operation: string, outcome: string): void {
    if (!httpsOrigin(origin) || !/^[A-Z_]{1,32}$/.test(operation) || !/^[a-z-]{1,64}$/.test(outcome)) return;
    this.data.audit.unshift({ id: randomUUID(), time: Date.now(), origin, operation, outcome }); this.data.audit.length = Math.min(1000, this.data.audit.length); this.save();
  }
}
