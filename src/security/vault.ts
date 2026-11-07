import { readFile, mkdir, writeFile, rename, unlink } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
export interface OsCipher { available(): boolean | Promise<boolean>; encrypt(value: string): Buffer | Promise<Buffer>; decrypt(value: Buffer): string | Promise<string> }
const providers = new Set(['openai', 'anthropic', 'gemini', 'compatible']);
/** Main-process only. Cipher must be an OS-backed implementation; no plaintext fallback. */
export class KeyVault {
  private pending: Promise<unknown> = Promise.resolve();
  private serial<T>(operation: () => Promise<T>): Promise<T> {
    const next = this.pending.then(operation); this.pending = next.catch(() => {}); return next;
  }
  constructor(private directory: string, private cipher: OsCipher) {}
  private file(provider: string): string {
    if (!providers.has(provider)) throw new Error('Unsupported provider');
    return path.join(this.directory, `${provider}.key`);
  }
  async set(provider: string, key: string): Promise<void> {
    const file = this.file(provider);
    return this.serial(async () => {
      if (typeof key !== 'string' || key.length < 1 || key.length > 8192) throw new Error('Invalid key');
      if (!await this.cipher.available()) throw new Error('OS protected storage unavailable');
      let encrypted: Buffer;
      try { encrypted = await this.cipher.encrypt(key); } catch { throw new Error('Key encryption failed'); }
      await mkdir(this.directory, { recursive: true, mode: 0o700 });
      const temporary = `${file}.${randomUUID()}.tmp`;
      try { await writeFile(temporary, encrypted, { flag: 'wx', mode: 0o600 }); await rename(temporary, file); }
      catch { throw new Error('Key storage failed'); }
      finally { await unlink(temporary).catch(() => {}); }
    });
  }
  async get(provider: string): Promise<string | null> {
    const file = this.file(provider);
    return this.serial(async () => {
      if (!await this.cipher.available()) throw new Error('OS protected storage unavailable');
      try {
        const data = await readFile(file);
        if (data.length > 65536) throw new Error('Invalid encrypted key');
        return await this.cipher.decrypt(data);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
        throw new Error('Key retrieval failed');
      }
    });
  }
  async delete(provider: string): Promise<void> {
    const file = this.file(provider);
    return this.serial(async () => {
      try { await unlink(file); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw new Error('Key deletion failed'); }
    });
  }
}
