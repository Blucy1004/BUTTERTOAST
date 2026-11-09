import { mkdir, open, rename, unlink } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { OsCipher } from '../security/vault';
import { isWebUrl } from '../policy';
import { exactKeys, record } from '../security/ipc';
export const TAB_LIMIT = 64;
export const GROUP_COLORS=['blue','violet','rose','teal','amber'] as const;
export type TabGroup={id:string;name:string;color:typeof GROUP_COLORS[number];collapsed:boolean};
export type SavedSplit={left:number;right:number;ratio:number};
export const validGroupName=(name:unknown):name is string=>typeof name==='string'&&name.trim().length>0&&name.length<=48&&!/[\u0000-\u001f\u007f]/.test(name);
export type SavedTab = { url: string; pinned: boolean; muted: boolean };
export type SessionSnapshot = { version: 1; active: number; tabs: string[] } | { version: 2; active: number; tabs: SavedTab[] } | {version:3;active:number;tabs:(SavedTab&{group:string})[];groups:TabGroup[];split:SavedSplit|null};
export function restorableUrl(value: unknown): value is string {
  return typeof value === 'string' && value.length <= 4096 && !/[\u0000-\u001f\u007f]/.test(value) && (value === '' || isWebUrl(value));
}
export function parseSession(value: unknown): SessionSnapshot | null {
  if (!record(value) || !exactKeys(value, ['version', 'active', 'tabs',...(value.version===3?['groups','split']:[])]) || ![1,2,3].includes(value.version as number)
    || !Array.isArray(value.tabs) || value.tabs.length < 1 || value.tabs.length > TAB_LIMIT
    || !Number.isSafeInteger(value.active)
    || (value.active as number) < 0 || (value.active as number) >= value.tabs.length) return null;
  if(value.version===1) return Array.from(value.tabs).every(restorableUrl) ? {version:1,active:value.active as number,tabs:[...value.tabs]} : null;
  if(value.version===3){
    if(!Array.isArray(value.groups)||value.groups.length>32||!Array.from(value.groups).every(g=>record(g)&&exactKeys(g,['id','name','color','collapsed'])&&typeof g.id==='string'&&/^[a-zA-Z0-9-]{1,64}$/.test(g.id)&&validGroupName(g.name)&&GROUP_COLORS.includes(g.color as TabGroup['color'])&&typeof g.collapsed==='boolean'))return null;
    const ids=new Set(value.groups.map(g=>g.id));if(ids.size!==value.groups.length)return null;
    if(!Array.from(value.tabs).every(t=>record(t)&&exactKeys(t,['url','pinned','muted','group'])&&restorableUrl(t.url)&&typeof t.pinned==='boolean'&&typeof t.muted==='boolean'&&typeof t.group==='string'&&(!t.group||ids.has(t.group))))return null;
    const split=value.split;if(split!==null&&(!record(split)||!exactKeys(split,['left','right','ratio'])||![split.left,split.right].every(i=>Number.isSafeInteger(i)&&(i as number)>=0&&(i as number)<(value.tabs as unknown[]).length)||split.left===split.right||typeof split.ratio!=='number'||!Number.isFinite(split.ratio)||split.ratio<.25||split.ratio>.75))return null;
    return {version:3,active:value.active as number,tabs:value.tabs.map(t=>({...t})),groups:value.groups.map(g=>({...g})),split:split?{...split as SavedSplit}:null};
  }
  if(!Array.from(value.tabs).every(t=>record(t)&&exactKeys(t,['url','pinned','muted'])&&restorableUrl(t.url)&&typeof t.pinned==='boolean'&&typeof t.muted==='boolean'))return null;
  return {version:2,active:value.active as number,tabs:value.tabs.map(t=>({...t}))};
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
        if ((await handle.stat()).size > 1024 * 1024) throw new Error('Invalid session size');
        data = await handle.readFile();
      } finally { await handle.close(); }
      const text = await this.cipher.decrypt(data);
      if (text.length > 512 * 1024) throw new Error('Invalid session size');
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
