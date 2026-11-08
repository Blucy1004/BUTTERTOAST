import { randomUUID } from 'node:crypto';
import { exactKeys, record } from './ipc';

export const PROTOCOL_VERSION = 2;
export type Permission = 'read' | 'write' | 'transmit' | 'delete' | 'pay';
export type Op = 'CLICK' | 'FILL' | 'SELECT' | 'SCROLL' | 'NAVIGATE' | 'WAIT' | 'READ' | 'EXTRACT' | 'VERIFY' | 'HANDOFF';
export type Action = { protocol: 2; document: string; id: string; tab: number; origin: string; version: number; op: Op; target: string; value: string };
export type ElementState = { visible: boolean; enabled: boolean; sensitive: boolean; actions: ReadonlySet<Op> };
export type PageState = { document: string; tab: number; origin: string; version: number; elements: ReadonlyMap<string, ElementState> };
export type Scope = { tab: number; origin: string; permissions: ReadonlySet<Permission> };
const ops = ['CLICK', 'FILL', 'SELECT', 'SCROLL', 'NAVIGATE', 'WAIT', 'READ', 'EXTRACT', 'VERIFY', 'HANDOFF'];
const targeted = new Set(['CLICK', 'FILL', 'SELECT', 'READ', 'EXTRACT', 'VERIFY']);
const approvalRequired = new Set(['CLICK', 'FILL', 'SELECT', 'SCROLL', 'NAVIGATE']);
function validOrigin(value: string): boolean {
  try { const url = new URL(value); return url.protocol === 'https:' && url.origin === value; } catch { return false; }
}
export function parseAction(value: unknown): Action | null {
  if (!record(value) || !exactKeys(value, ['protocol', 'document', 'id', 'tab', 'origin', 'version', 'op', 'target', 'value'])) return null;
  if (value.protocol !== 2 || typeof value.document !== 'string' || !/^[a-zA-Z0-9_-]{16,80}$/.test(value.document) || typeof value.id !== 'string' || !/^[a-zA-Z0-9_-]{1,80}$/.test(value.id)
    || !Number.isSafeInteger(value.tab) || (value.tab as number) < 1 || !Number.isSafeInteger(value.version) || (value.version as number) < 0
    || typeof value.origin !== 'string' || !validOrigin(value.origin) || !ops.includes(value.op as string)
    || typeof value.target !== 'string' || value.target.length > 100 || typeof value.value !== 'string' || value.value.length > 4096) return null;
  if (targeted.has(value.op as string) ? !/^[a-zA-Z0-9_-]{1,100}$/.test(value.target) : value.target !== '') return null;
  if (value.op === 'WAIT' && !/^(?:[1-9]\d{0,2}|[1-4]\d{3}|5000)$/.test(value.value)) return null;
  if (value.op === 'SCROLL' && !/^-?(?:[1-9]\d{0,2}|1000)$/.test(value.value)) return null;
  if (value.op === 'NAVIGATE') {
    try { const u = new URL(value.value); if (u.origin !== value.origin || u.username || u.password || u.protocol !== 'https:') return null; } catch { return null; }
  }
  if (!['FILL', 'SELECT', 'WAIT', 'SCROLL', 'NAVIGATE', 'VERIFY'].includes(value.op as string) && value.value !== '') return null;
  // Copy/freeze: a caller cannot mutate an already validated command during an await.
  return Object.freeze({ protocol: 2, document: value.document, id: value.id, tab: value.tab as number, origin: value.origin,
    version: value.version as number, op: value.op as Op, target: value.target, value: value.value });
}
export type Verdict = { ok: true; action: Action; signal: AbortSignal; lease: string } | { ok: false; reason: string };
/** Main-process authorization primitive. Never expose grant/approve to model or web IPC. */
export class ToastGuard {
  private scope: Scope | null = null;
  private controller = new AbortController();
  private consumed = new Set<string>();
  private approvals = new Map<string, { action: string; expires: number }>();
  private inFlight: string | null = null;
  private attempts = 0;
  constructor(private clock: () => number = () => performance.now()) {}
  grant(scope: Scope): void {
    this.stop();
    if (!Number.isSafeInteger(scope.tab) || scope.tab < 1 || !validOrigin(scope.origin)) throw new Error('Invalid scope');
    this.scope = { ...scope, permissions: new Set(scope.permissions) };
    this.controller = new AbortController(); this.consumed.clear(); this.attempts = 0;
  }
  stop(): void { this.controller.abort(); this.scope = null; this.approvals.clear(); }
  canRead(state: Pick<PageState, 'tab' | 'origin'>): boolean {
    return !!this.scope && !this.controller.signal.aborted && this.scope.tab === state.tab
      && this.scope.origin === state.origin && this.scope.permissions.has('read');
  }
  private check(action: Action, state: PageState): string | null {
    if (!this.scope || this.controller.signal.aborted) return 'stopped';
    if (action.tab !== this.scope.tab || action.tab !== state.tab || action.origin !== this.scope.origin || action.origin !== state.origin) return 'scope';
    if (action.document !== state.document) return 'document';
    if (action.version !== state.version) return 'stale';
    if (this.consumed.has(action.id)) return 'replay';
    if (this.consumed.size >= 512) return 'budget';
    const required: Permission[] = ['READ', 'EXTRACT', 'VERIFY', 'WAIT'].includes(action.op) ? ['read']
      : ['CLICK','FILL','SELECT','SCROLL','NAVIGATE'].includes(action.op) ? ['write', 'transmit', 'delete', 'pay'] : action.op === 'HANDOFF' ? [] : ['write'];
    if (required.some(p => !this.scope!.permissions.has(p))) return 'permission';
    if (action.target) {
      const element = state.elements.get(action.target);
      if (!element || !element.visible || !element.enabled || element.sensitive || !element.actions.has(action.op)) return 'target';
    }
    return null;
  }
  /** Called only AFTER a trusted UI explicitly approves this exact action and page version. */
  approve(input: unknown, state: PageState): string | null {
    const action = parseAction(input);
    if (!action || this.check(action, state) || !approvalRequired.has(action.op)) return null;
    for (const [id, item] of this.approvals) if (item.expires <= this.clock()) this.approvals.delete(id);
    if (this.approvals.size >= 32) return null;
    const token = randomUUID(); this.approvals.set(token, { action: JSON.stringify(action), expires: this.clock() + 30_000 }); return token;
  }
  /** Claim once immediately before execution. Driver must revalidate target/version atomically and observe signal. */
  claim(input: unknown, state: PageState, approval?: string): Verdict {
    if (++this.attempts > 1024) { this.stop(); return { ok: false, reason: 'attempt-budget' }; }
    const action = parseAction(input);
    if (!action) return { ok: false, reason: 'schema' };
    if (this.inFlight) return { ok: false, reason: 'busy' };
    const reason = this.check(action, state);
    if (reason) return { ok: false, reason };
    if (approvalRequired.has(action.op)) {
      const approved = approval ? this.approvals.get(approval) : undefined;
      if (!approved || approved.expires <= this.clock() || approved.action !== JSON.stringify(action)) return { ok: false, reason: 'approval' };
      this.approvals.delete(approval!);
    }
    this.consumed.add(action.id); this.inFlight = randomUUID();
    if (action.op === 'HANDOFF') this.stop();
    return { ok: true, action, signal: this.controller.signal, lease: this.inFlight };
  }
  finish(lease: string): void { if (lease === this.inFlight) this.inFlight = null; }
}
