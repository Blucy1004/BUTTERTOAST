import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { AuthApi, AuthFailure, AuthSession, parseAuthSession } from './api';
import { AuthCommand, AuthState, normalizeEmail } from './protocol';
import { record } from '../security/ipc';
import { AUTH_SETTINGS } from './config';
import { ConfirmationListener } from './confirmation';
import {AuthPersistence} from './storage';
import { PROFILE_KEY, parseProfile, profileFromUser,defaultProfile } from '../profile/model';

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
  private pending?: { email: string; verifier: string; receiver: Receiver; recovery?:boolean };
  private state: AuthState;
  private epoch = 0;
  private operation?: AbortController;
  private refreshTimer?: NodeJS.Timeout;
  private expiryTimer?: NodeJS.Timeout;
  private pendingTimer?: NodeJS.Timeout;
  private nextLogin = 0;
  private nextSignup = 0;
  private nextProfileWrite = 0;
  private disposed = false;
  private remembering=false;
  private localProfiles=new Map<string,{profile:ReturnType<typeof defaultProfile>;sync:boolean}>();
  constructor(private api: AuthApi | null, private changed: () => void,
    private receiverFactory: () => Receiver = () => new ConfirmationListener(), private now: () => number = Date.now,private persistence?:AuthPersistence) {
    this.state = { configured: !!api, status: 'signed-out', email: '', busy: false,syncEnabled:false,storageAvailable:persistence?.available??false,remembered:false,profile:null,profileRevision:'',profileWarning:'',
      message: api ? '' : 'Supabase 연결 설정이 필요합니다.' };
  }
  private persistProfile(id:string,profile:ReturnType<typeof defaultProfile>,sync:boolean):void {
    const copy={profile:structuredClone(profile),sync};this.localProfiles.set(id,copy);if(this.localProfiles.size>16)this.localProfiles.delete(this.localProfiles.keys().next().value!);
    const epoch=this.epoch;void this.persistence?.saveProfile(id,copy).catch(()=>{if(epoch===this.epoch)this.emit({profileWarning:'설정이 메모리에 적용됐지만 OS 보호 저장소에 저장하지 못했습니다.'});});
  }
  async confirmLogoutOthers(confirm:()=>Promise<boolean>):Promise<void> {const epoch=this.epoch,current=this.session;if(!current||this.state.busy)return;try{if(await confirm()&&epoch===this.epoch&&this.session===current)await this.command({type:'logout-others'});}catch{if(epoch===this.epoch)this.emit({message:'기기 세션 해제를 완료하지 못했습니다.'});}}
  async restoreRemembered():Promise<void> {
    if(!this.persistence?.available||!this.api||this.state.busy||this.session||this.disposed)return;
    const epoch=this.invalidate();this.emit({busy:true,message:'저장된 로그인을 확인하는 중입니다.'});
    try {
      const stored=await this.persistence.loadSession();if(epoch!==this.epoch)return;
      if(!stored){this.emit({busy:false,message:''});return;}
      const data=await this.api.request('token',{refresh_token:stored.refresh},this.signal(),'?grant_type=refresh_token');if(epoch!==this.epoch)return;
      const session=parseAuthSession(data,stored.email,this.now());if(session.id!==stored.id)throw new AuthFailure('response');
      this.remembering=true;this.accept(data,stored.email);
    }catch{if(epoch===this.epoch){await this.persistence.saveSession(null).catch(()=>{});if(epoch===this.epoch)this.emit({busy:false,message:'저장된 로그인을 확인하지 못했습니다. 다시 로그인해 주세요.'});}}
  }
  publicState(): AuthState { return structuredClone(this.state); }
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
    this.state.syncEnabled=false;this.state.remembered=false;this.remembering=false;
    this.state.profile=null;this.state.profileRevision='';this.state.profileWarning='';
    this.state.recovering = false;
    return this.epoch;
  }
  private signal(): AbortSignal {
    this.operation = new AbortController();
    return AbortSignal.any([this.operation.signal, AbortSignal.timeout(20_000)]);
  }
  private forgetSavedSession():void {
    const epoch=this.epoch;
    void this.persistence?.saveSession(null).catch(()=>{if(epoch===this.epoch)this.emit({message:'이 기기의 이전 로그인 저장 파일 삭제를 확인하지 못했습니다. 기기 저장소 상태를 확인하세요.'});});
  }
  private accept(data: unknown, email: string): void {
    const session = parseAuthSession(data, email, this.now());
    const local=this.persistence?.profile(session.id)??this.localProfiles.get(session.id)??{profile:defaultProfile(),sync:false};
    const {profile,warning}=local.sync?profileFromUser((data as {user:unknown}).user):{profile:local.profile,warning:''};
    const revision=this.session?.id===session.id&&JSON.stringify(profile)===JSON.stringify(this.state.profile)?this.state.profileRevision:randomUUID();
    clearTimeout(this.refreshTimer); clearTimeout(this.expiryTimer);
    this.session = session; this.clearPending(true);
    this.expiryTimer = setTimeout(() => {
      this.invalidate();this.forgetSavedSession(); this.emit({ status: 'signed-out', email: '', busy: false, message: '로그인이 만료되었습니다. 다시 로그인해 주세요.' });
    }, Math.max(1, session.expiresAt - this.now())); this.expiryTimer.unref();
    this.emit({ status: 'signed-in', email: session.email, busy: false,syncEnabled:local.sync,remembered:this.remembering,profile,profileRevision:revision,profileWarning:warning,message:this.remembering?'로그인되었습니다. 이 기기의 OS 보호 저장소에 세션을 보관합니다.':'로그인되었습니다. 앱을 종료하면 다시 로그인해야 합니다.' });
    this.persistProfile(session.id,profile,local.sync);
    if(this.remembering){const epoch=this.epoch;void this.persistence?.saveSession({id:session.id,email:session.email,refresh:session.refresh}).catch(()=>{if(epoch===this.epoch){this.remembering=false;this.forgetSavedSession();this.emit({remembered:false,message:'세션을 안전하게 저장하지 못했습니다. 이번 실행에서만 로그인됩니다.'});}});}
    else this.forgetSavedSession();
    const delay = Math.max(500, session.expiresAt - this.now() - Math.min(60_000, (session.expiresAt - this.now()) / 2));
    this.refreshTimer = setTimeout(() => { void this.refresh(); }, delay); this.refreshTimer.unref();
  }
  private async refresh(): Promise<void> {
    if (!this.session || !this.api || this.disposed) return;
    if(this.state.busy){this.refreshTimer=setTimeout(()=>{void this.refresh();},1000);this.refreshTimer.unref();return;}
    const epoch = this.epoch, current = this.session;
    this.emit({busy:true});
    try {
      const data = await this.api.request('token', { refresh_token: current.refresh }, this.signal(), '?grant_type=refresh_token');
      if (epoch === this.epoch) {
        const renewed = parseAuthSession(data, current.email, this.now());
        if (renewed.id !== current.id) throw new AuthFailure('response');
        this.accept(data, current.email);
      }
    } catch {
      if (epoch !== this.epoch) return;
      this.invalidate();this.forgetSavedSession(); this.emit({ status: 'signed-out', email: '', busy: false, message: '로그인이 만료되었거나 연결이 끊겼습니다. 다시 로그인해 주세요.' });
    }
  }
  private async confirm(code: string, epoch: number): Promise<boolean> {
    const pending = this.pending;
    if (!pending || !this.api || this.state.busy || epoch !== this.epoch || this.disposed) return false;
    this.emit({ busy: true });
    try {
      const data = await this.api.request('token', { auth_code: code, code_verifier: pending.verifier }, this.signal(), '?grant_type=pkce');
      if (epoch !== this.epoch) return false;
      this.accept(data, pending.email);
      if(pending.recovery)this.emit({recovering:true,message:'복구 메일 인증이 완료됐습니다. 새 비밀번호를 입력하세요.'}); return true;
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
      try{await this.persistence?.saveSession(null);}catch{if(epoch===this.epoch)this.emit({message:'메모리 세션을 지웠지만 저장된 로그인 삭제는 확인하지 못했습니다. 기기 저장소 상태를 확인하세요.'});}
      if (previous && this.api) {
        try { await this.api.request('logout', null, AbortSignal.timeout(10_000), '?scope=local', previous.access); }
        catch { if (epoch === this.epoch) this.emit({ message: '이 앱의 로그인 정보는 지웠습니다. 연결 오류로 서버 세션 해제는 확인하지 못했습니다.' }); }
      }
      return;
    }
    if(command.type==='logout-others'){
      if(!this.api||!this.session||this.state.busy)return;const epoch=this.epoch,current=this.session;this.emit({busy:true});
      try{await this.api.request('logout',null,this.signal(),'?scope=others',current.access);if(epoch===this.epoch)this.emit({busy:false,message:'다른 기기의 갱신 세션을 해제했습니다. 이미 발급된 접근 토큰은 만료까지 유효할 수 있습니다.'});}catch{if(epoch===this.epoch)this.emit({busy:false,message:'다른 기기 로그아웃을 확인하지 못했습니다.'});}return;
    }
    if(command.type==='profile-sync'){
      if(!this.session||this.state.busy||command.revision!==this.state.profileRevision)return;
      const current=this.session;this.emit({syncEnabled:command.enabled});this.persistProfile(current.id,this.state.profile??defaultProfile(),command.enabled);
      if(command.enabled)await this.command({type:'profile-reload',revision:this.state.profileRevision});
      else this.emit({message:'프로필 동기화를 껐습니다. 이후 변경은 이 기기에만 저장됩니다. 기존 서버 프로필은 남아 있습니다.'});return;
    }
    if(command.type==='profile-save'||command.type==='profile-reload'){
      if(!this.api||!this.session||this.state.busy)return;
      if(command.revision!==this.state.profileRevision){this.emit({message:'계정이나 프로필이 바뀌었습니다. 현재 설정을 다시 불러온 뒤 저장해 주세요.'});return;}
      const profile=command.type==='profile-save'?parseProfile(command.profile):null;
      if(command.type==='profile-save'&&!profile)return;
      if(command.type==='profile-save'&&this.now()<this.nextProfileWrite){this.emit({message:'잠시 후 프로필을 다시 저장해 주세요.'});return;}
      if(command.type==='profile-save')this.nextProfileWrite=this.now()+1000;
      const current=this.session,epoch=this.epoch;
      if(!this.state.syncEnabled){const value=profile??this.persistence?.profile(current.id).profile??this.localProfiles.get(current.id)?.profile??defaultProfile();this.persistProfile(current.id,value,false);this.emit({profile:value,profileRevision:randomUUID(),message:this.persistence?.available?'프로필을 이 기기에 저장했습니다.':'프로필을 이번 실행에 적용했습니다. OS 보호 저장소를 사용할 수 없습니다.'});return;}
      this.emit({busy:true,message:command.type==='profile-save'?'계정에 저장하는 중입니다.':'계정 프로필을 불러오는 중입니다.'});
      try {
        const data=await this.api.request('user',profile?{data:{[PROFILE_KEY]:profile}}:null,this.signal(),'',current.access);
        if(epoch!==this.epoch)return;
        if(!record(data)||data.id!==current.id||normalizeEmail(data.email)!==current.email||typeof data.email_confirmed_at!=='string'||!Number.isFinite(Date.parse(data.email_confirmed_at)))throw new AuthFailure('response');
        const result=profileFromUser(data);
        if(profile&&(!record(data.user_metadata)||!Object.hasOwn(data.user_metadata,PROFILE_KEY)||result.warning||JSON.stringify(result.profile)!==JSON.stringify(profile)))throw new AuthFailure('response');
        this.persistProfile(current.id,result.profile,true);
        this.emit({busy:false,profile:result.profile,profileRevision:randomUUID(),profileWarning:result.warning,message:profile?'프로필과 꾸미기 설정을 계정에 저장했습니다.':'계정 프로필을 다시 불러왔습니다.'});
      }catch{if(epoch===this.epoch)this.emit({busy:false,message:'프로필 저장·불러오기 결과를 확인하지 못했습니다. 연결을 확인하고 다시 불러오기를 눌러 주세요.'});}
      return;
    }
    if(command.type==='password-update'||command.type==='reauthenticate') {
      if(!this.api||!this.session||this.state.busy)return;
      if(command.type==='password-update'&&!this.state.recovering&&!command.currentPassword){this.emit({message:'현재 비밀번호를 입력해 주세요.'});return;}
      const epoch=this.epoch,current=this.session;this.emit({busy:true,message:''});
      try {
        const body=command.type==='password-update'?{password:command.password,...(command.currentPassword?{current_password:command.currentPassword}:{}),...(command.nonce?{nonce:command.nonce}:{})}:null;
        const result=await this.api.request(command.type==='password-update'?'user':'reauthenticate',body,this.signal(),'',current.access);
        if(epoch!==this.epoch)return;
        if(command.type==='password-update'&&(!record(result)||result.id!==current.id))throw new AuthFailure('response');
        if(command.type==='password-update'){await this.command({type:'logout'});this.emit({message:'비밀번호를 변경했습니다. 새 비밀번호로 로그인하세요.'});}
        else this.emit({busy:false,message:'재인증 코드가 발송됐다면 아래 코드 입력란에 입력하세요.'});
      }catch{if(epoch===this.epoch)this.emit({busy:false,message:'변경을 완료하지 못했습니다. 현재 비밀번호와 재인증 코드, 서버 정책을 확인하세요.'});}
      return;
    }
    if (!this.api || this.state.busy || this.session) return;
    if (this.now() < (command.type === 'signup' || command.type==='recover' ? this.nextSignup : this.nextLogin)) { this.emit({ message: '잠시 후 다시 시도해 주세요.' }); return; }
    const epoch = this.invalidate();
    this.remembering=command.type==='login'&&command.remember===true&&this.persistence?.available===true;
    if (command.type === 'signup'||command.type==='recover') this.nextSignup = this.now() + 60_000;
    else this.nextLogin = this.now() + 3000;
    this.emit({ status: 'signed-out', email: '', busy: true, message: '' });
    try {
      if (command.type === 'login') {
        const data = await this.api.request('token', { email: command.email, password: command.password }, this.signal(), '?grant_type=password');
        if (epoch === this.epoch) this.accept(data, command.email);
      } else {
        const receiver = this.receiverFactory(), verifier = randomBytes(32).toString('base64url');
        this.pending = { email: command.email, verifier, receiver, recovery:command.type==='recover' };
        let redirect: string;
        try { redirect = await receiver.start(code => this.confirm(code, epoch)); }
        catch { throw new AuthFailure('confirmation'); }
        if (epoch !== this.epoch) { receiver.close(); return; }
        const data = await this.api.request(command.type==='recover'?'recover':'signup', { email: command.email, ...(command.type==='signup'?{password:command.password}:{}),
          code_challenge: createHash('sha256').update(verifier).digest('base64url'), code_challenge_method: 's256' },
        this.signal(), `?redirect_to=${encodeURIComponent(redirect)}`);
        if (epoch !== this.epoch) return;
        // A token here means email autoconfirm is enabled; do not silently bypass the intended flow.
        if (!record(data)) throw new AuthFailure('response');
        if ('access_token' in data) throw new AuthFailure('policy');
        if (command.type==='signup'&&(typeof data.id !== 'string' || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(data.id) || normalizeEmail(data.email) !== command.email)) throw new AuthFailure('response');
        this.emit({ status: 'pending-email', email: command.email, busy: false,
          message: command.type==='recover'?'가입된 주소라면 복구 메일이 도착합니다. 앱을 켜 둔 채 같은 컴퓨터에서 링크를 눌러 주세요.':'가입 가능한 주소라면 인증 메일이 도착합니다. 앱을 켜 둔 채 같은 컴퓨터에서 링크를 눌러 주세요. 이미 가입했다면 로그인해 주세요.' });
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
