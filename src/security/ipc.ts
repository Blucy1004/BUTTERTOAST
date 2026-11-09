export type Command = { type: 'ready' | 'new' | 'back' | 'forward' | 'reload' | 'stop' | 'reopen' | 'restart' | 'suspend' | 'privacy-toggle' | 'account-open' | 'ai-toggle' | 'ai-next' | 'ai-stop-all' | 'downloads-open' | 'manager-open' | 'bookmark' | 'workspace-resize-end' | 'find-open' | 'find-close' | 'theme-cycle' | 'reload-hard' | 'fullscreen' | 'new-window' | 'popup-open' | 'command-open' | 'command-close' | 'split-close' | 'tab-return' }
  | { type: 'move'; id: number; delta: -1 | 1 } | { type: 'select' | 'close' | 'delegate' | 'tab-menu'|'group-new'|'tab-detach'; id: number } | { type: 'navigate'; address: string }
  | {type:'toast-draft';text:string;kind:'text'|'link'|'selection'}
  | {type:'split-tab';id:number;side:'left'|'right'} | {type:'split-resize';ratio:number}
  | {type:'tab-group';id:number;group:string} | {type:'group-update';id:string;name:string;color:string}
  | {type:'suggest'|'command-query';query:string} | {type:'command-execute'|'favorite-open'|'group-toggle'|'group-remove'|'task-history-open';id:string} | {type:'reorder';id:number;before:number} | {type:'find';text:string;forward:boolean;next:boolean} | {type:'zoom';direction:-1|0|1}
  | { type: 'workspace-toggle'; side: 'left' | 'right' }
  | { type: 'workspace-drag'; active: boolean }
  | { type: 'workspace-resize'; side: 'left' | 'right'; width: number };
export function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
    && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
}
export function exactKeys(value: Record<string, unknown>, keys: string[]): boolean {
  return Object.keys(value).length === keys.length && keys.every(k => Object.hasOwn(value, k));
}
export function parseCommand(value: unknown): Command | null {
  if (!record(value)) return null;
  const type = value.type;
  if (['ready', 'new', 'back', 'forward', 'reload', 'stop', 'reopen', 'restart', 'suspend', 'privacy-toggle', 'account-open', 'ai-toggle', 'ai-next', 'ai-stop-all', 'downloads-open', 'manager-open', 'bookmark', 'workspace-resize-end','find-open','find-close','theme-cycle','reload-hard','fullscreen','new-window','popup-open','command-open','command-close','split-close','tab-return'].includes(type as string) && exactKeys(value, ['type'])) return value as Command;
  if (['select','close','delegate','tab-menu','group-new','tab-detach'].includes(type as string) && exactKeys(value, ['type', 'id']) && Number.isSafeInteger(value.id) && (value.id as number) > 0) return value as Command;
  if(['suggest','command-query'].includes(type as string)&&exactKeys(value,['type','query'])&&typeof value.query==='string'&&value.query.length<=256&&!/[\u0000-\u001f\u007f]/.test(value.query))return value as Command;
  if(['command-execute','favorite-open','group-toggle','group-remove','task-history-open'].includes(type as string)&&exactKeys(value,['type','id'])&&typeof value.id==='string'&&/^[a-zA-Z0-9-]{1,64}$/.test(value.id))return value as Command;
  if(type==='toast-draft'&&exactKeys(value,['type','text','kind'])&&typeof value.text==='string'&&value.text.trim().length>0&&value.text.length<=12000&&['text','link','selection'].includes(value.kind as string)){if(value.kind==='link'){try{const u=new URL(value.text);if(u.protocol!=='https:'||u.username||u.password||value.text.length>4096)return null;}catch{return null;}}return value as Command;}
  if(type==='split-tab'&&exactKeys(value,['type','id','side'])&&Number.isSafeInteger(value.id)&&(value.id as number)>0&&['left','right'].includes(value.side as string))return value as Command;
  if(type==='split-resize'&&exactKeys(value,['type','ratio'])&&typeof value.ratio==='number'&&Number.isFinite(value.ratio)&&value.ratio>=.25&&value.ratio<=.75)return value as Command;
  if(type==='tab-group'&&exactKeys(value,['type','id','group'])&&Number.isSafeInteger(value.id)&&(value.id as number)>0&&typeof value.group==='string'&&/^[a-zA-Z0-9-]{0,64}$/.test(value.group))return value as Command;
  if(type==='group-update'&&exactKeys(value,['type','id','name','color'])&&typeof value.id==='string'&&/^[a-zA-Z0-9-]{1,64}$/.test(value.id)&&typeof value.name==='string'&&value.name.trim().length>0&&value.name.length<=48&&!/[\u0000-\u001f\u007f]/.test(value.name)&&['blue','violet','rose','teal','amber'].includes(value.color as string))return value as Command;
  if(type==='reorder'&&exactKeys(value,['type','id','before'])&&[value.id,value.before].every(id=>Number.isSafeInteger(id)&&(id as number)>0))return value as Command;
  if(type==='find'&&exactKeys(value,['type','text','forward','next'])&&typeof value.text==='string'&&value.text.length<=256&&!/[\u0000-\u001f\u007f]/.test(value.text)&&typeof value.forward==='boolean'&&typeof value.next==='boolean')return value as Command;
  if(type==='zoom'&&exactKeys(value,['type','direction'])&&[-1,0,1].includes(value.direction as number))return value as Command;
  if (type === 'workspace-toggle' && exactKeys(value,['type','side']) && ['left','right'].includes(value.side as string)) return value as Command;
  if (type === 'workspace-drag' && exactKeys(value,['type','active']) && typeof value.active === 'boolean') return value as Command;
  if (type === 'workspace-resize' && exactKeys(value,['type','side','width']) && ['left','right'].includes(value.side as string) && Number.isSafeInteger(value.width)
    && (value.width as number) >= (value.side==='left'?160:300) && (value.width as number) <= (value.side==='left'?420:720)) return value as Command;
  if (type === 'move' && exactKeys(value, ['type', 'id', 'delta']) && Number.isSafeInteger(value.id) && (value.id as number) > 0 && (value.delta === -1 || value.delta === 1)) return value as Command;
  if (type === 'navigate' && exactKeys(value, ['type', 'address']) && typeof value.address === 'string' && value.address.length > 0 && value.address.length <= 4096) return value as Command;
  return null;
}
/** One gate per privileged UI; invalid messages also consume capacity. */
export class RateGate {
  private tokens: number;
  private last = 0;
  constructor(private capacity=30,private perSecond=10) {this.tokens=capacity;}
  allow(now = performance.now()): boolean {
    this.tokens = Math.min(this.capacity, this.tokens + Math.max(0, now - this.last) * this.perSecond / 1000);
    this.last = now;
    if (this.tokens < 1) return false;
    this.tokens--; return true;
  }
}
