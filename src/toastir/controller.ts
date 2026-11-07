import type { WebContents } from 'electron';
import { randomUUID } from 'node:crypto';
import { ToastGuard, parseAction, PageState, Permission, Op } from '../security/guard';
import { installToastRuntime } from './runtime';
const WORLD = 1001;
type Snapshot = { document: string; version: number; origin: string; elements: { id: string; role: string; name: string; visible: boolean; enabled: boolean; sensitive: boolean; actions: Op[] }[] };
export type Result = { ok: boolean; reason?: string; text?: string; matches?: boolean };
/** Main-only experimental READ/CLICK path, permanently bound to one WebContents.
 * No page/renderer IPC exports. Caller may not substitute snapshots or tab objects.
 */
export class ToastController {
  private guard = new ToastGuard();
  private generation = 0;
  private disposed = false;
  private busy = false;
  constructor(private readonly contents: WebContents) {
    contents.on('did-start-navigation', this.onNavigate);
    contents.on('render-process-gone', this.onInvalidate);
    contents.on('destroyed', this.onInvalidate);
  }
  private onNavigate = (event: { isMainFrame: boolean }) => { if (event.isMainFrame) this.stop(); };
  private onInvalidate = () => this.stop();
  stop(): void { this.generation++; this.guard.stop(); }
  dispose(): void {
    this.stop(); this.disposed = true;
    this.contents.removeListener('did-start-navigation', this.onNavigate);
    this.contents.removeListener('render-process-gone', this.onInvalidate);
    this.contents.removeListener('destroyed', this.onInvalidate);
  }
  /** Trusted host only, after user explicitly authorizes this task's origin. */
  grant(permissions: ReadonlySet<Permission>): void {
    if (this.disposed || this.contents.isDestroyed()) throw new Error('Task unavailable');
    const origin = new URL(this.contents.getURL()).origin;
    this.stop(); this.guard.grant({ tab: this.contents.id, origin, permissions });
  }
  private async call(method: 'capture' | 'perform', input?: unknown): Promise<unknown> {
    if (this.disposed || this.contents.isDestroyed()) throw new Error('Task unavailable');
    // Only fixed app code plus JSON data crosses the boundary. The web page cannot access WORLD.
    const code = `(${installToastRuntime.toString()})(${JSON.stringify(randomUUID())}); globalThis.__toastIR.${method}(${input === undefined ? '' : JSON.stringify(input)})`;
    return this.contents.executeJavaScriptInIsolatedWorld(WORLD, [{ code }]);
  }
  private async capture(): Promise<Snapshot> { return await this.call('capture') as Snapshot; }
  private state(snapshot: Snapshot): PageState {
    return { document: snapshot.document, tab: this.contents.id, origin: snapshot.origin, version: snapshot.version,
      elements: new Map(snapshot.elements.map(e => [e.id, { ...e, actions: new Set(e.actions) }])) };
  }
  /** Read-permission gated metadata for this task only. Treat all names as untrusted page data. */
  async snapshot(): Promise<Snapshot & { tab: number }> {
    const epoch = this.generation;
    const data = await this.capture();
    if (epoch !== this.generation || !this.guard.canRead(this.state(data))) throw new Error('Context access denied');
    return { ...data, tab: this.contents.id };
  }
  /** Callback belongs to trusted UI; model must not supply it or approve based on page text. */
  async requestApproval(input: unknown, confirm: () => Promise<boolean>): Promise<string | null> {
    const action = parseAction(input), epoch = this.generation;
    if (!action || action.tab !== this.contents.id || !['CLICK'].includes(action.op)) return null;
    try {
      const before = await this.capture();
      if (epoch !== this.generation || !this.guard.canRead(this.state(before)) || action.document !== before.document || action.version !== before.version) return null;
      if (!await confirm() || epoch !== this.generation) return null;
      const after = await this.capture();
      if (epoch !== this.generation) return null;
      return this.guard.approve(action, this.state(after));
    } catch { return null; }
  }
  async execute(input: unknown, approval?: string): Promise<Result> {
    const action = parseAction(input);
    if (!action || action.tab !== this.contents.id) return { ok: false, reason: 'schema-or-tab' };
    if (!['CLICK', 'READ', 'EXTRACT', 'VERIFY'].includes(action.op)) return { ok: false, reason: 'unsupported' };
    if (this.busy) return { ok: false, reason: 'busy' };
    this.busy = true;
    const epoch = this.generation;
    let lease: string | undefined;
    try {
      const snapshot = await this.capture();
      if (epoch !== this.generation) return { ok: false, reason: 'task-changed' };
      const verdict = this.guard.claim(action, this.state(snapshot), approval);
      if (!verdict.ok) return verdict;
      lease = verdict.lease;
      if (verdict.signal.aborted) return { ok: false, reason: 'stopped' };
      const result = await this.call('perform', verdict.action) as Result;
      // Never deliver data after revocation, even if the renderer operation already finished.
      if (epoch !== this.generation || verdict.signal.aborted) return { ok: false, reason: 'task-changed' };
      return result;
    } catch { return { ok: false, reason: 'context-unavailable' }; }
    finally { if (lease) this.guard.finish(lease); this.busy = false; }
  }
}
