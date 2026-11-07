import { ModelAdapter, AiFailure } from './adapter';
import { AiCommand, ChatMessage, Connection, Provider, Usage, parseConnection, safeText } from './protocol';
import { KeyVault } from '../security/vault';
import { record } from '../security/ipc';
export type PageContext = { source: 'human' | 'task'; origin: string; text: string; elements: { id: string; role: string; name: string }[] };
export interface Attachment { data: PageContext; check(): Promise<boolean>; valid(): boolean; click(target: string): Promise<boolean>; dispose(): void }
export interface AiHost { capture(source: 'human' | 'task'): Promise<Attachment>; openTask(url: string): Promise<void>; closeTask(): void; stopTask?(): void; hide(): void }
export type AiState = { connected: boolean; provider: Provider; endpoint: string; model: string; models: string[]; busy: boolean; message: string;
  storageAvailable: boolean; messages: ChatMessage[]; usage: Usage; requests: number; context: PageContext | null; proposal: { target: string; name: string; origin: string } | null };
const errors = { auth: 'API 키와 사용 권한을 확인해 주세요.', limit: '요청 한도 또는 대화 길이 한도에 도달했습니다. 잠시 후 또는 새 대화에서 다시 시도해 주세요.',
  model: '연결 주소와 모델 ID가 이 API에서 지원되는지 확인해 주세요.', response: 'AI 응답 형식을 확인하지 못했습니다.', network: 'AI 서버 연결이 실패했거나 시간이 초과됐습니다.' };
export class AiService {
  private config?: Connection;
  private attachment?: Attachment;
  private epoch = 0;
  private operation?: AbortController;
  private history: ChatMessage[] = [];
  private conversationRequests = 0;
  private nextRequest = 0;
  private disposed = false;
  private state: AiState = { connected: false, provider: 'openai', endpoint: '', model: '', models: [], busy: false, message: '연결 설정에서 API를 연결해 주세요.', storageAvailable: false,
    messages: [], usage: { input: 0, output: 0, cached: 0 }, requests: 0, context: null, proposal: null };
  constructor(private adapter: ModelAdapter, private vault: KeyVault, private host: AiHost, private changed: () => void, private now = Date.now) {}
  publicState(): AiState { return structuredClone(this.state); }
  storageAvailable(value: boolean): void { this.emit({ storageAvailable: value }); }
  invalidInput(): void { this.emit({ message: '입력 형식을 확인해 주세요. 외부 API 주소는 HTTPS, 로컬 HTTP는 localhost 또는 127.0.0.1만 지원합니다.' }); }
  private emit(value: Partial<AiState>): void { if (this.disposed) return; this.state = { ...this.state, ...value }; this.changed(); }
  private invalidate(): number { this.epoch++; this.operation?.abort(); this.operation = undefined; return this.epoch; }
  private signal(): AbortSignal { this.operation = new AbortController(); return AbortSignal.any([this.operation.signal, AbortSignal.timeout(60_000)]); }
  private dropContext(): void { this.attachment?.dispose(); this.attachment = undefined; this.state.context = null; this.state.proposal = null; }
  revokeContext(): void {
    if (!this.attachment) return;
    this.invalidate(); this.dropContext(); this.emit({ busy: false, message: '페이지나 탭이 바뀌어 공유와 실행 제안을 해제했습니다.' });
  }
  observe(): void { if (this.attachment && !this.attachment.valid()) this.revokeContext(); }
  private failure(error: unknown): string { return error instanceof AiFailure ? errors[error.code] : '작업을 완료하지 못했습니다. 연결이나 페이지 상태를 확인해 주세요.'; }
  async command(command: AiCommand): Promise<void> {
    if (this.disposed) return;
    switch (command.type) {
      case 'ready': this.changed(); return;
      case 'hide': this.stop(); this.host.hide(); return;
      case 'stop': this.stop(); return;
      case 'clear': this.stop(); this.history = []; this.conversationRequests = 0; this.emit({ messages: [], message: '새 대화를 시작합니다.' }); return;
      case 'remove-context': case 'reject': this.revokeContext(); return;
      case 'forget': await this.forget(command.provider); return;
      case 'task-close': this.stop(); this.host.closeTask(); return;
    }
    if (this.state.busy) return;
    switch (command.type) {
      case 'connect': await this.connect(command, command.remember); break;
      case 'restore': {
        const epoch = this.invalidate(); this.emit({ busy: true, message: '' });
        try {
          const stored = await this.vault.get(command.provider);
          if (epoch !== this.epoch) return;
          const raw: unknown = stored ? JSON.parse(stored) : null;
          const config = record(raw) ? parseConnection(raw.provider, raw.endpoint, raw.key) : null;
          if (!config || config.provider !== command.provider) { this.emit({ busy: false, message: '저장된 연결을 불러오지 못했습니다.' }); return; }
          await this.connect(config, false);
        } catch { if (epoch === this.epoch) this.emit({ busy: false, message: 'OS 보호 저장소에서 연결을 불러오지 못했습니다.' }); }
        break;
      }
      case 'model': this.stop(); this.emit({ model: command.model, message: '모델을 변경했습니다. 필요한 페이지는 다시 공유해 주세요.' }); break;
      case 'send': await this.send(command.text); break;
      case 'share': await this.share(command.source); break;
      case 'task-open': {
        this.stop(); const epoch = this.epoch; this.emit({ busy: true, message: '별도 AI 작업 창을 여는 중입니다.' });
        try { await this.host.openTask(command.url); if (epoch === this.epoch) this.emit({ busy: false, message: 'AI 작업 창을 열었습니다. 공유할 내용을 먼저 확인해 주세요.' }); }
        catch { if (epoch === this.epoch) this.emit({ busy: false, message: 'AI 작업 페이지를 열지 못했습니다.' }); } break;
      }
      case 'approve': await this.approve(); break;
    }
  }
  private stop(): void { this.host.stopTask?.(); this.invalidate(); this.dropContext(); this.emit({ busy: false, message: '중단했습니다. 이미 서버에 보낸 요청은 사용량이 발생했을 수 있습니다.' }); }
  private async connect(config: Connection, remember: boolean): Promise<void> {
    const epoch = this.invalidate(); this.dropContext(); this.config = undefined; this.history = []; this.conversationRequests = 0;
    this.emit({ connected: false, busy: true, messages: [], model: '', models: [], provider: config.provider, endpoint: config.endpoint, message: '연결과 모델 목록을 확인하는 중입니다.' });
    try {
      if (remember && !this.state.storageAvailable) { this.emit({ busy: false, message: 'OS 암호화 저장을 사용할 수 없습니다. 저장 옵션을 끄면 이번 실행 중에만 키를 사용할 수 있습니다.' }); return; }
      const models = await this.adapter.models(config, this.signal());
      if (epoch !== this.epoch) return;
      if (remember) await this.vault.set(config.provider, JSON.stringify(config));
      if (epoch !== this.epoch) return;
      this.config = config;
      const preferred = models.find(m => m === 'gpt-4.1-mini') || models.find(m => m.startsWith('claude-haiku-')) || models.find(m => /^gpt-|^claude-/.test(m) && !/audio|realtime|tts|transcribe|image/.test(m)) || models[0] || '';
      this.emit({ connected: true, busy: false, models, model: preferred, message: remember ? '연결 확인 완료. 키는 OS 암호화로 저장했습니다.' : '연결 확인 완료. 키는 이번 실행 중에만 사용합니다.' });
    } catch (error) { if (epoch === this.epoch) this.emit({ busy: false, message: this.failure(error) }); }
  }
  private async forget(provider: Provider): Promise<void> {
    this.stop(); const epoch = this.epoch;
    if (this.config?.provider === provider) { this.config = undefined; this.history = []; this.emit({ connected: false, models: [], model: '', messages: [] }); }
    try { await this.vault.delete(provider); if (epoch === this.epoch) this.emit({ message: '해당 연결의 저장된 키를 삭제했습니다.' }); }
    catch { if (epoch === this.epoch) this.emit({ message: '메모리 연결을 중단했지만 저장된 키 삭제는 확인하지 못했습니다.' }); }
  }
  private async share(source: 'human' | 'task'): Promise<void> {
    this.stop(); const epoch = this.epoch; this.emit({ busy: true, message: '공유할 페이지 내용을 읽는 중입니다.' });
    try {
      const attachment = await this.host.capture(source);
      if (epoch !== this.epoch) { attachment.dispose(); return; }
      this.attachment = attachment; this.emit({ busy: false, context: attachment.data, message: '아래 미리보기를 확인하세요. 다음 전송에만 페이지 내용이 포함됩니다.' });
    } catch { if (epoch === this.epoch) this.emit({ busy: false, message: '현재 페이지를 읽을 수 없습니다. HTTPS 페이지를 연 뒤 다시 시도해 주세요.' }); }
  }
  private async send(text: string): Promise<void> {
    if (!this.config || !this.state.model) { this.emit({ message: 'API 연결과 모델 선택이 필요합니다.' }); return; }
    if (this.now() < this.nextRequest || this.conversationRequests >= 30) { this.emit({ message: errors.limit }); return; }
    if (!this.state.context) this.dropContext();
    const epoch = this.invalidate(), config = this.config, attachment = this.attachment;
    this.nextRequest = this.now() + 1500; this.emit({ busy: true, proposal: null, message: 'AI 응답을 기다리는 중입니다.' });
    try {
      if (attachment && !await attachment.check()) { if (epoch === this.epoch) this.revokeContext(); return; }
      if (epoch !== this.epoch) return;
      this.conversationRequests++; this.state.requests++;
      this.emit({ messages: [...this.history, { role: 'user', content: safeText(text, 12000) }] });
      const reply = await this.adapter.chat(config, this.state.model, this.history, text, attachment?.data ?? null, this.signal());
      if (epoch !== this.epoch) return;
      if (attachment && !await attachment.check()) { this.revokeContext(); return; }
      if (epoch !== this.epoch) return;
      this.history.push({ role: 'user', content: safeText(text, 12000) }, { role: 'assistant', content: reply.text });
      while (this.history.length > 20 || this.history.reduce((n, m) => n + m.content.length, 0) > 45000) this.history.splice(0, 2);
      const target = attachment?.data.source === 'task' && attachment.data.elements.find(e => e.id === reply.click);
      this.emit({ busy: false, messages: [...this.history], usage: { input: this.state.usage.input + reply.usage.input, output: this.state.usage.output + reply.usage.output, cached: this.state.usage.cached + reply.usage.cached },
        context: null, proposal: target ? { target: target.id, name: target.name, origin: attachment!.data.origin } : null,
        message: target ? 'AI가 클릭을 제안했습니다. 실행 전 대상과 사이트를 확인하세요.' : '응답을 받았습니다.' });
      if (!target) { this.dropContext(); this.changed(); }
    } catch (error) { if (epoch === this.epoch) { this.dropContext(); this.emit({ busy: false, message: this.failure(error) }); } }
  }
  private async approve(): Promise<void> {
    const attachment = this.attachment, proposal = this.state.proposal;
    if (!attachment || !proposal || attachment.data.source !== 'task') return;
    const epoch = this.invalidate(); this.emit({ busy: true, proposal: null, message: '클릭 승인 대기 중입니다.' });
    try {
      const ok = await attachment.click(proposal.target);
      if (epoch !== this.epoch) return;
      this.dropContext(); this.emit({ busy: false, message: ok ? '승인한 클릭을 실행했습니다. 다음 작업은 페이지를 다시 확인해 주세요.' : '승인 취소 또는 페이지 변경으로 실행하지 않았습니다.' });
    } catch { if (epoch === this.epoch) { this.dropContext(); this.emit({ busy: false, message: '페이지 상태가 달라 실행하지 않았습니다.' }); } }
  }
  dispose(): void { this.invalidate(); this.dropContext(); this.config = undefined; this.history = []; this.disposed = true; }
}
