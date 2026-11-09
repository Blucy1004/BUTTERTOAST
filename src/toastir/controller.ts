import {requireFeature} from '../product/access';
import type { WebContents } from 'electron';
import { randomUUID } from 'node:crypto';
import { ToastGuard, parseAction, PageState, Permission, Op } from '../security/guard';
import { installToastRuntime } from './runtime';
import {encodeIR,diffIR,IRDelta,validateSnapshot} from './codec';
const WORLD = 1001;
export type Snapshot = { text: string; document: string; version: number; origin: string; elements: { id: string; parent: string|null; role: string; name: string; visible: boolean; enabled: boolean; sensitive: boolean; actions: Op[] }[] };
export type ActionPoint = { x: number; y: number; width: number; height: number };
export type CaptureStatistics={visited:number;elements:number;textCharacters:number;shadowRoots:number;framesSkipped:number;truncated:boolean;captureMs:number};
export type Result = { ok: boolean; reason?: string; text?: string; matches?: boolean; point?: ActionPoint };
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
    requireFeature('toastir');
    if (this.disposed || this.contents.isDestroyed()) throw new Error('Task unavailable');
    const origin = new URL(this.contents.getURL()).origin;
    this.stop(); this.guard.grant({ tab: this.contents.id, origin, permissions });
  }
  private async call(method: 'capture' | 'perform' | 'selection' | 'statistics', input?: unknown): Promise<unknown> {
    if (this.disposed || this.contents.isDestroyed()) throw new Error('Task unavailable');
    // Only fixed app code plus JSON data crosses the boundary. The web page cannot access WORLD.
    const code = `(${installToastRuntime.toString()})(${JSON.stringify(randomUUID())}); globalThis.__toastIR.${method}(${input === undefined ? '' : JSON.stringify(input)})`;
    return this.contents.executeJavaScriptInIsolatedWorld(WORLD, [{ code }]);
  }
  private async capture(includeText = false): Promise<Snapshot> {
    let timer:NodeJS.Timeout|undefined;
    try {
      const raw=await Promise.race([this.call('capture',includeText),new Promise<never>((_,reject)=>{timer=setTimeout(()=>{this.stop();reject(new Error('Capture timeout'));},5000);timer.unref();})]);
      const result=validateSnapshot(raw);if(!result)throw new Error('Invalid capture');return result;
    } finally {clearTimeout(timer);}
  }
  private state(snapshot: Snapshot): PageState {
    return { document: snapshot.document, tab: this.contents.id, origin: snapshot.origin, version: snapshot.version,
      elements: new Map(snapshot.elements.map(e => [e.id, { ...e, actions: new Set(e.actions) }])) };
  }
  /** Read-permission gated metadata and visible text for this task only. Treat all names as untrusted page data. */
  async snapshot(): Promise<Snapshot & { tab: number }> {
    const epoch = this.generation;
    if (this.disposed || this.contents.isDestroyed() || !this.guard.canRead({ tab: this.contents.id, origin: new URL(this.contents.getURL()).origin })) throw new Error('Context access denied');
    const data = await this.capture(true);
    if (epoch !== this.generation || !this.guard.canRead(this.state(data))) throw new Error('Context access denied');
    return { ...data, tab: this.contents.id };
  }
  async binarySnapshot():Promise<Buffer> {const {tab,...snapshot}=await this.snapshot();return encodeIR(snapshot);}
  async statistics():Promise<CaptureStatistics> {
    const epoch=this.generation;
    if(this.disposed||this.contents.isDestroyed()||!this.guard.canRead({tab:this.contents.id,origin:new URL(this.contents.getURL()).origin}))throw new Error('Context access denied');
    const data=await this.call('statistics') as CaptureStatistics;
    if(epoch!==this.generation||!data||typeof data.truncated!=='boolean'||Object.values(data).some(x=>typeof x==='number'&&(!Number.isFinite(x)||x<0)))throw new Error('Invalid statistics');
    return data;
  }
  async selectedText():Promise<string> {
    const epoch=this.generation;
    await this.snapshot();const text=await this.call('selection');
    if(epoch!==this.generation||typeof text!=='string'||text.length>4000)throw new Error('Selection unavailable');
    return text;
  }
  async changes(previous:Snapshot):Promise<IRDelta|null> {const next=await this.snapshot();return diffIR(previous,next);}
  /** Callback belongs to trusted UI; model must not supply it or approve based on page text. */
  async requestApproval(input: unknown, confirm: () => Promise<boolean>): Promise<string | null> {
    const action = parseAction(input), epoch = this.generation;
    if (!action || action.tab !== this.contents.id || !['CLICK', 'FILL', 'SELECT', 'SCROLL', 'NAVIGATE'].includes(action.op)) return null;
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
      if (action.op === 'HANDOFF') return {ok:true};
      if (verdict.signal.aborted) return { ok: false, reason: 'stopped' };
      if (action.op === 'WAIT') {
        await new Promise<void>((resolve, reject) => {
          const cancel = () => { clearTimeout(timer); reject(new Error('Stopped')); };
          const timer = setTimeout(() => { verdict.signal.removeEventListener('abort', cancel); resolve(); }, Number(action.value));
          verdict.signal.addEventListener('abort', cancel, { once:true });
        });
        return epoch === this.generation && !verdict.signal.aborted ? {ok:true} : {ok:false,reason:'task-changed'};
      }
      const result = await this.call('perform', verdict.action) as Result;
      // Never deliver data after revocation, even if the renderer operation already finished.
      if (epoch !== this.generation || verdict.signal.aborted) return { ok: false, reason: 'task-changed' };
      return result;
    } catch { return { ok: false, reason: 'context-unavailable' }; }
    finally { if (lease) this.guard.finish(lease); this.busy = false; }
  }
}
