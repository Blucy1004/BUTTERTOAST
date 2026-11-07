import { createHash, randomBytes } from 'node:crypto';
import { AuthApi, AuthFailure, AuthSession, parseAuthSession } from './api';
import { AuthCommand, AuthState, normalizeEmail } from './protocol';
import { record } from '../security/ipc';
import { AUTH_SETTINGS } from './config';
import { ConfirmationListener } from './confirmation';

type Receiver = Pick<ConfirmationListener, 'start' | 'close'>;
const messages: Record<string, string> = {
  email_not_confirmed: '가입 메일의 인증 링크를 먼저 눌러 주세요.',
  over_email_send_rate_limit: '메일 전송 한도에 도달했습니다. 잠시 후 다시 시도해 주세요.',
  over_request_rate_limit: '요청이 많습니다. 잠시 후 다시 시도해 주세요.',
  email_address_not_authorized: '현재 메일 설정에서는 이 주소로 발송할 수 없습니다. 프로젝트의 SMTP 설정을 확인해 주세요.',
  weak_password: '비밀번호가 서버 정책에 맞지 않습니다. 8자 이상의 다른 비밀번호를 사용해 주세요.',
  signup_disabled: '현재 회원가입이 비활성화되어 있습니다.',
  credentials: '이메일과 비밀번호를 확인해 주세요.',
  confirmation: '이메일 인증 수신 창을 열지 못했습니다. 다른 ButterToast를 닫고 다시 시도해 주세요.',
  policy: '서버의 이메일 확인 설정을 확인해 주세요. 인증 메일을 통한 가입이 필요합니다.'
};
/** Owns all credentials. Only the explicit public state crosses IPC. */
export class AuthService {
  private session?: AuthSession;
  private pending?: { email: string; verifier: string; receiver: Receiver };
  private state: AuthState;
  private epoch = 0;
  private operation?: AbortController;
  private refreshTimer?: NodeJS.Timeout;
  private expiryTimer?: NodeJS.Timeout;
  private pendingTimer?: NodeJS.Timeout;
  private nextLogin = 0;
  private nextSignup = 0;
  private disposed = false;
  constructor(private api: AuthApi | null, private changed: () => void,
    private receiverFactory: () => Receiver = () => new ConfirmationListener(), private now: () => number = Date.now) {
    this.state = { configured: !!api, status: 'signed-out', email: '', busy: false,
      message: api ? '' : 'Supabase 연결 설정이 필요합니다.' };
  }
  publicState(): AuthState { return { ...this.state }; }
  private emit(update: Partial<AuthState>): void { this.state = { ...this.state, ...update }; this.changed(); }
  private clearPending(graceful = false): void {
    clearTimeout(this.pendingTimer); this.pendingTimer = undefined;
    this.pending?.receiver.close(graceful); this.pending = undefined;
  }
  private invalidate(): number {
    this.epoch++; this.operation?.abort(); this.operation = undefined;
    clearTimeout(this.refreshTimer); this.refreshTimer = undefined;
    clearTimeout(this.expiryTimer); this.expiryTimer = undefined;
    this.clearPending(); this.session = undefined;
    return this.epoch;
  }
  private signal(): AbortSignal {
    this.operation = new AbortController();
    return AbortSignal.any([this.operation.signal, AbortSignal.timeout(20_000)]);
  }
  private accept(data: unknown, email: string): void {
    const session = parseAuthSession(data, email, this.now());
    clearTimeout(this.refreshTimer); clearTimeout(this.expiryTimer);
    this.session = session; this.clearPending(true);
    this.expiryTimer = setTimeout(() => {
      this.invalidate(); this.emit({ status: 'signed-out', email: '', busy: false, message: '로그인이 만료되었습니다. 다시 로그인해 주세요.' });
    }, Math.max(1, session.expiresAt - this.now())); this.expiryTimer.unref();
    this.emit({ status: 'signed-in', email: session.email, busy: false, message: '로그인되었습니다. 앱을 종료하면 다시 로그인해야 합니다.' });
    const delay = Math.max(500, session.expiresAt - this.now() - Math.min(60_000, (session.expiresAt - this.now()) / 2));
    this.refreshTimer = setTimeout(() => { void this.refresh(); }, delay); this.refreshTimer.unref();
  }
  private async refresh(): Promise<void> {
    if (!this.session || !this.api || this.disposed) return;
    const epoch = this.epoch, current = this.session;
    try {
      const data = await this.api.request('token', { refresh_token: current.refresh }, this.signal(), '?grant_type=refresh_token');
      if (epoch === this.epoch) {
        const renewed = parseAuthSession(data, current.email, this.now());
        if (renewed.id !== current.id) throw new AuthFailure('response');
        this.accept(data, current.email);
      }
    } catch {
      if (epoch !== this.epoch) return;
      this.invalidate(); this.emit({ status: 'signed-out', email: '', busy: false, message: '로그인이 만료되었거나 연결이 끊겼습니다. 다시 로그인해 주세요.' });
    }
  }
  private async confirm(code: string, epoch: number): Promise<boolean> {
    const pending = this.pending;
    if (!pending || !this.api || this.state.busy || epoch !== this.epoch || this.disposed) return false;
    this.emit({ busy: true });
    try {
      const data = await this.api.request('token', { auth_code: code, code_verifier: pending.verifier }, this.signal(), '?grant_type=pkce');
      if (epoch !== this.epoch) return false;
      this.accept(data, pending.email); return true;
    } catch {
      if (epoch === this.epoch) this.emit({ busy: false, message: '인증 링크를 확인하지 못했습니다. 메일 인증 후 다시 로그인해 주세요.' });
      return false;
    }
  }
  async command(command: AuthCommand): Promise<void> {
    if (this.disposed) return;
    if (command.type === 'state') { this.changed(); return; }
    if (command.type === 'logout') {
      const previous = this.session, epoch = this.invalidate();
      this.emit({ status: 'signed-out', email: '', busy: false, message: '이 앱에서 로그아웃했습니다.' });
      if (previous && this.api) {
        try { await this.api.request('logout', null, AbortSignal.timeout(10_000), '?scope=local', previous.access); }
        catch { if (epoch === this.epoch) this.emit({ message: '이 앱의 로그인 정보는 지웠습니다. 연결 오류로 서버 세션 해제는 확인하지 못했습니다.' }); }
      }
      return;
    }
    if (!this.api || this.state.busy || this.session) return;
    if (this.now() < (command.type === 'signup' ? this.nextSignup : this.nextLogin)) { this.emit({ message: '잠시 후 다시 시도해 주세요.' }); return; }
    const epoch = this.invalidate();
    if (command.type === 'signup') this.nextSignup = this.now() + 60_000;
    else this.nextLogin = this.now() + 3000;
    this.emit({ status: 'signed-out', email: '', busy: true, message: '' });
    try {
      if (command.type === 'login') {
        const data = await this.api.request('token', { email: command.email, password: command.password }, this.signal(), '?grant_type=password');
        if (epoch === this.epoch) this.accept(data, command.email);
      } else {
        const receiver = this.receiverFactory(), verifier = randomBytes(32).toString('base64url');
        this.pending = { email: command.email, verifier, receiver };
        let redirect: string;
        try { redirect = await receiver.start(code => this.confirm(code, epoch)); }
        catch { throw new AuthFailure('confirmation'); }
        if (epoch !== this.epoch) { receiver.close(); return; }
        const data = await this.api.request('signup', { email: command.email, password: command.password,
          code_challenge: createHash('sha256').update(verifier).digest('base64url'), code_challenge_method: 's256' },
        this.signal(), `?redirect_to=${encodeURIComponent(redirect)}`);
        if (epoch !== this.epoch) return;
        // A token here means email autoconfirm is enabled; do not silently bypass the intended flow.
        if (!record(data)) throw new AuthFailure('response');
        if ('access_token' in data) throw new AuthFailure('policy');
        if (typeof data.id !== 'string' || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(data.id) || normalizeEmail(data.email) !== command.email) throw new AuthFailure('response');
        this.emit({ status: 'pending-email', email: command.email, busy: false,
          message: '가입 가능한 주소라면 인증 메일이 도착합니다. 앱을 켜 둔 채 같은 컴퓨터에서 링크를 눌러 주세요. 이미 가입했다면 로그인해 주세요.' });
        this.pendingTimer = setTimeout(() => {
          if (epoch !== this.epoch) return;
          this.invalidate(); this.emit({ status: 'signed-out', email: '', busy: false, message: '인증 대기 시간이 지났습니다. 메일 인증 후 로그인해 주세요.' });
        }, AUTH_SETTINGS.emailExpirySeconds * 1000); this.pendingTimer.unref();
      }
    } catch (error) {
      if (epoch !== this.epoch) return;
      this.clearPending(); this.emit({ status: 'signed-out', email: '', busy: false,
        message: error instanceof AuthFailure && messages[error.code] || '연결을 완료하지 못했습니다. 잠시 후 다시 시도해 주세요.' });
    }
  }
  dispose(): void { this.disposed = true; this.invalidate(); }
}
