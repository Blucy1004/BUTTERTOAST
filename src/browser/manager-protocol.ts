import { exactKeys, record } from '../security/ipc';
import { httpsOrigin, parseSettings, Settings, sitePermission, SitePermission } from './library';
export type ManagerCommand = { type: 'ready' | 'bookmark-current' | 'history-clear' | 'audit-clear' | 'default-browser' | 'clear-site-data' | 'update-check' | 'update-install' }
  | {type:'support-open';id:'source'|'roadmap'|'chatgpt-docs'}
  | {type:'import';kind:'bookmarks'|'history'|'settings'} | {type:'export';kind:'bookmarks'|'settings'}
  | { type: 'settings'; settings: Settings }
  | { type: 'entry-open' | 'entry-remove'; kind: 'bookmarks' | 'history'; id: string }
  | { type: 'bookmark-rename'; id: string; title: string }
  | { type: 'permission'; origin: string; permission: SitePermission; decision: 'ask' | 'allow' | 'deny' }
  | { type: 'download'; id: string; action: 'pause' | 'resume' | 'cancel' | 'show' | 'remove' };
export function parseManagerCommand(v: unknown): ManagerCommand | null {
  if (!record(v)) return null;
  if (['ready', 'bookmark-current', 'history-clear', 'audit-clear', 'default-browser', 'clear-site-data', 'update-check', 'update-install'].includes(v.type as string) && exactKeys(v, ['type'])) return { type: v.type } as ManagerCommand;
  if(['import','export'].includes(v.type as string)&&exactKeys(v,['type','kind'])&&(v.type==='import'?['bookmarks','history','settings']:['bookmarks','settings']).includes(v.kind as string))return {...v} as ManagerCommand;
  if(v.type==='support-open'&&exactKeys(v,['type','id'])&&['source','roadmap','chatgpt-docs'].includes(v.id as string))return {...v} as ManagerCommand;
  if (v.type === 'settings' && exactKeys(v, ['type', 'settings'])) { const settings = parseSettings(v.settings); return settings ? { type: 'settings', settings } : null; }
  if (v.type === 'permission' && exactKeys(v, ['type', 'origin', 'permission', 'decision']) && httpsOrigin(v.origin) && sitePermission(v.permission) && ['ask', 'allow', 'deny'].includes(v.decision as string)) return { ...v } as ManagerCommand;
  if (typeof v.id !== 'string' || !/^[\w-]{1,80}$/.test(v.id)) return null;
  if (['entry-open', 'entry-remove'].includes(v.type as string) && exactKeys(v, ['type', 'kind', 'id']) && ['bookmarks', 'history'].includes(v.kind as string)) return { ...v } as ManagerCommand;
  if (v.type === 'bookmark-rename' && exactKeys(v, ['type', 'id', 'title']) && typeof v.title === 'string' && v.title.length <= 200) return { ...v } as ManagerCommand;
  if (v.type === 'download' && exactKeys(v, ['type', 'id', 'action']) && ['pause', 'resume', 'cancel', 'show', 'remove'].includes(v.action as string)) return { ...v } as ManagerCommand;
  return null;
}
