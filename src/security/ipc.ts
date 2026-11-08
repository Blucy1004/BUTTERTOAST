export type Command = { type: 'ready' | 'new' | 'back' | 'forward' | 'reload' | 'stop' | 'reopen' | 'restart' | 'suspend' | 'privacy-toggle' | 'account-open' | 'ai-toggle' | 'ai-next' | 'manager-open' | 'bookmark' | 'workspace-resize-end' }
  | { type: 'move'; id: number; delta: -1 | 1 } | { type: 'select' | 'close' | 'delegate'; id: number } | { type: 'navigate'; address: string }
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
  if (['ready', 'new', 'back', 'forward', 'reload', 'stop', 'reopen', 'restart', 'suspend', 'privacy-toggle', 'account-open', 'ai-toggle', 'ai-next', 'manager-open', 'bookmark', 'workspace-resize-end'].includes(type as string) && exactKeys(value, ['type'])) return value as Command;
  if ((type === 'select' || type === 'close' || type === 'delegate') && exactKeys(value, ['type', 'id']) && Number.isSafeInteger(value.id) && (value.id as number) > 0) return value as Command;
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
