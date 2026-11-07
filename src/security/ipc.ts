export type Command = { type: 'ready' | 'new' | 'back' | 'forward' | 'reload' | 'stop' | 'reopen' | 'restart' | 'suspend' | 'privacy-toggle' }
  | { type: 'move'; id: number; delta: -1 | 1 } | { type: 'select' | 'close'; id: number } | { type: 'navigate'; address: string };
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
  if (['ready', 'new', 'back', 'forward', 'reload', 'stop', 'reopen', 'restart', 'suspend', 'privacy-toggle'].includes(type as string) && exactKeys(value, ['type'])) return value as Command;
  if ((type === 'select' || type === 'close') && exactKeys(value, ['type', 'id']) && Number.isSafeInteger(value.id) && (value.id as number) > 0) return value as Command;
  if (type === 'move' && exactKeys(value, ['type', 'id', 'delta']) && Number.isSafeInteger(value.id) && (value.id as number) > 0 && (value.delta === -1 || value.delta === 1)) return value as Command;
  if (type === 'navigate' && exactKeys(value, ['type', 'address']) && typeof value.address === 'string' && value.address.length > 0 && value.address.length <= 4096) return value as Command;
  return null;
}
/** One gate per privileged UI; invalid messages also consume capacity. */
export class RateGate {
  private tokens = 30;
  private last = 0;
  allow(now = performance.now()): boolean {
    this.tokens = Math.min(30, this.tokens + Math.max(0, now - this.last) / 100);
    this.last = now;
    if (this.tokens < 1) return false;
    this.tokens--; return true;
  }
}
