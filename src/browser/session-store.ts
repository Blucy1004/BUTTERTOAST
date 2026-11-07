import { mkdir, open, rename, unlink } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { OsCipher } from '../security/vault';
import { isWebUrl } from '../policy';
import { exactKeys, record } from '../security/ipc';
export const TAB_LIMIT = 30;
export type SessionSnapshot = { version: 1; active: number; tabs: string[] };
export function restorableUrl(value: unknown): value is string {
  return typeof value === 'string' && value.length <= 4096 && !/[\u0000-\u001f\u007f]/.test(value) && (value === '' || isWebUrl(value));
}
export function parseSession(value: unknown): SessionSnapshot | null {
  if (!record(value) || !exactKeys(value, ['version', 'active', 'tabs']) || value.version !== 1
    || !Array.isArray(value.tabs) || value.tabs.length < 1 || value.tabs.length > TAB_LIMIT
    || !Array.from(value.tabs).every(restorableUrl) || !Number.isSafeInteger(value.active)
    || (value.active as number) < 0 || (value.active as number) >= value.tabs.length) return null;
  return { version: 1, active: value.active as number, tabs: [...value.tabs] };
}
/** URLs may contain tokens. Never write a plaintext fallback when OS storage is unavailable. */
export class TabSessionStore {
  status: 'available' | 'unavailable' | 'failed' = 'unavailable';
  private latest: SessionSnapshot | null = null;
  private writing: Promise<void> | null = null;
  private available = false;
  constructor(private file: string, private cipher: OsCipher, private changed: () => void = () => {}) {}
  async load(): Promise<SessionSnapshot | null> {
    try {
      this.available = await this.cipher.available();
      this.status = this.available ? 'available' : 'unavailable';
      if (!this.available) return null;
      const handle = await open(this.file, 'r');
      let data: Buffer;
      try {
        if ((await handle.stat()).size > 512 * 1024) throw new Error('Invalid session size');
        data = await handle.readFile();
      } finally { await handle.close(); }
      const text = await this.cipher.decrypt(data);
      if (text.length > 256 * 1024) throw new Error('Invalid session size');
      const parsed = parseSession(JSON.parse(text));
      if (!parsed) throw new Error('Invalid session');
      return parsed;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') this.status = 'failed';
      return null;
    }
  }
  save(snapshot: SessionSnapshot): Promise<void> {
    const copy = parseSession(snapshot);
    if (!copy || !this.available) return Promise.resolve();
    this.latest = copy;
    if (!this.writing) {
      this.writing = this.drain().finally(() => { this.writing = null; });
    }
    return this.writing;
  }
  private async drain(): Promise<void> {
    while (this.latest) {
      const snapshot = this.latest; this.latest = null;
      const temp = `${this.file}.${randomUUID()}.tmp`;
      try {
        const data = await this.cipher.encrypt(JSON.stringify(snapshot));
        await mkdir(path.dirname(this.file), { recursive: true, mode: 0o700 });
        const handle = await open(temp, 'wx', 0o600);
        try { await handle.writeFile(data); await handle.sync(); } finally { await handle.close(); }
        await rename(temp, this.file); this.status = 'available';
      } catch { this.status = 'failed'; }
      finally { await unlink(temp).catch(() => {}); }
      this.changed();
    }
  }
  async flush(): Promise<void> { await this.writing; }
}
