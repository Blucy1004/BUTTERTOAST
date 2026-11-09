import {requireFeature} from '../product/access';
import { ModelAdapter, AiFailure } from './adapter';
import { AiCommand, ChatMessage, Connection, Provider, Usage, Proposal, parseProposal, parseConnection, safeText } from './protocol';
import { KeyVault } from '../security/vault';
import { record } from '../security/ipc';
import {defaultOptions,ModelOptions,estimatedCost} from './options';
import { performance } from 'node:perf_hooks';
import {modelSnapshot,chooseModelFrame,ModelSnapshot} from '../toastir/model';
export type PageContext = { source: 'human' | 'task' | 'controlled'; origin: string; document?:string;version?:number;captureMs?:number;truncated?:boolean;text: string; elements: { id: string; role: string; name: string; actions?: string[] }[] };
export type ActionObservation={ok:boolean;reason?:string;text?:string;matches?:boolean};
export interface Attachment { data: PageContext; check(): Promise<boolean>; valid(): boolean; click(target: string): Promise<boolean>; act?(proposal: Proposal): Promise<boolean|ActionObservation>; dispose(): void }
export interface AiHost { capture(source: 'human' | 'task' | 'controlled', selectionOnly?:boolean): Promise<Attachment>; openTask(url: string): Promise<void>; closeTask(): void; stopTask?(): void; hide(): void; confirmWorkflow?(origin:string):Promise<boolean>; handoff?(source?:PageContext['source']):void; completed?():void;
  saveChat?(messages:ChatMessage[]):Promise<void>;loadChat?():Promise<ChatMessage[]>;deleteChat?():Promise<void> }
type Workflow={goal:string;origin:string;step:number;limit:number;status:'running'|'paused'|'completed';model:string;lastOutcome?:{operation:string;outcome:'dispatched'|'observed'|'blocked-or-unconfirmed';text?:string;matches?:boolean;reason?:string}};
export type AiState = { connected: boolean; provider: Provider; endpoint: string; model: string; models: string[]; busy: boolean; message: string;
  metrics:{captureMs:number;modelMs:number;contextBytes:number;fullContextBytes:number;frame:'none'|'snapshot'|'delta';actions:number;failures:number;interventions:number};
  options: ModelOptions; estimatedCost: number; contextRemaining: number | null;
  workflow: Workflow|null;
  storageAvailable: boolean; messages: ChatMessage[]; usage: Usage; requests: number; context: PageContext | null; proposal: { target: string; name: string; origin: string; action?: Proposal } | null };
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
  private wireHistory:ChatMessage[]=[];
  private previousPage:ModelSnapshot|null=null;
  private disposed = false;
  private executing = false;
  private state: AiState = { connected: false, provider: 'openai', endpoint: '', model: '', models: [], busy: false, message: '연결 설정에서 API를 연결해 주세요.', storageAvailable: false,
    metrics:{captureMs:0,modelMs:0,contextBytes:0,fullContextBytes:0,frame:'none',actions:0,failures:0,interventions:0},
    options:{...defaultOptions},estimatedCost:0,contextRemaining:null,workflow:null,
    messages: [], usage: { input: 0, output: 0, cached: 0 }, requests: 0, context: null, proposal: null };
  constructor(private adapter: ModelAdapter, private vault: KeyVault, private host: AiHost, private changed: () => void, private now = () => performance.now()) {}
  publicState(): AiState { return structuredClone(this.state); }
  storageAvailable(value: boolean): void { this.emit({ storageAvailable: value }); }
  invalidInput(): void { this.emit({ message: '입력 형식을 확인해 주세요. 외부 API 주소는 HTTPS, 로컬 HTTP는 localhost 또는 127.0.0.1만 지원합니다.' }); }
  private emit(value: Partial<AiState>): void { if (this.disposed) return; this.state = { ...this.state, ...value }; this.changed(); }
  private invalidate(): number { this.epoch++; this.operation?.abort(); this.operation = undefined; return this.epoch; }
  private signal(): AbortSignal { this.operation = new AbortController(); return AbortSignal.any([this.operation.signal, AbortSignal.timeout(60_000)]); }
  private dropContext(): void { this.attachment?.dispose(); this.attachment = undefined; this.state.context = null; this.state.proposal = null; }
  private resetWire():void {this.wireHistory=[];this.previousPage=null;}
  revokeContext(): void {
    if (!this.attachment) return;
    if(this.executing){this.dropContext();return;}
    this.resetWire();
    if(this.state.workflow?.status==='running')this.state.workflow.status='paused';
    this.invalidate(); this.dropContext(); this.emit({ busy: false, message: '페이지나 탭이 바뀌어 공유와 실행 제안을 해제했습니다.' });
  }
  observe(): void { if (this.attachment && !this.attachment.valid()) this.revokeContext(); }
  workspaceHidden():void {if(this.attachment?.data.source!=='task')this.revokeContext();}
  private failure(error: unknown): string { return error instanceof AiFailure ? errors[error.code] : '작업을 완료하지 못했습니다. 연결이나 페이지 상태를 확인해 주세요.'; }
  async command(command: AiCommand): Promise<void> {
    if (this.disposed) return;
    requireFeature('byok');
    switch (command.type) {
      case 'save-chat':case 'load-chat':case 'delete-chat': {
        this.stop();const epoch=this.epoch;this.emit({busy:true});
        try{
          if(command.type==='save-chat'){if(!this.host.saveChat)throw Error();await this.host.saveChat(this.history);}
          if(command.type==='delete-chat'){if(!this.host.deleteChat)throw Error();await this.host.deleteChat();}
          if(command.type==='load-chat'){if(!this.host.loadChat)throw Error();const saved=await this.host.loadChat();if(epoch!==this.epoch)return;this.history=saved;this.state.workflow=null;this.emit({messages:[...saved]});}
          if(epoch===this.epoch)this.emit({busy:false,message:command.type==='delete-chat'?'저장된 대화를 삭제했습니다.':command.type==='load-chat'?'저장된 대화를 불러왔습니다. 다음 전송 시 선택한 모델에 대화가 포함됩니다.':'대화를 OS 암호화로 저장했습니다.'});
        }catch{if(epoch===this.epoch)this.emit({busy:false,message:'보호 저장소의 대화를 저장·불러오기·삭제하지 못했습니다.'});}break;
      }
      case 'ready': this.changed(); return;
      case 'hide': this.workspaceHidden(); this.host.hide(); return;
      case 'stop': this.stop(); return;
      case 'clear': this.stop(); this.history = []; this.conversationRequests = 0; this.emit({ messages: [], workflow:null, message: '새 대화를 시작합니다.' }); return;
      case 'handoff': this.stop(); this.host.handoff?.(); this.emit({message:'AI 제어를 회수했습니다. 작업 페이지를 직접 조작할 수 있습니다.'});return;
      case 'remove-context': case 'reject': this.revokeContext(); return;
      case 'forget': await this.forget(command.provider); return;
      case 'task-close': this.stop(); this.state.workflow=null;this.host.closeTask(); return;
    }
    if (this.state.busy) return;
    switch (command.type) {
      case 'run-task': await this.startWorkflow(command.goal,command.steps);break;
      case 'continue-task': if(this.state.workflow?.status==='paused')await this.advance();break;
      case 'connect': await this.connect(command, command.remember); break;
      case 'options': this.emit({options:{...command.options},message:'모델 옵션을 적용했습니다. 단가·컨텍스트 한도는 사용자 입력값이며 지원하지 않는 추론 옵션은 서버가 거부할 수 있습니다.'}); break;
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
      case 'send': this.state.workflow=null;this.resetWire();await this.send(command.text); break;
      case 'share': await this.share(command.source); break;
      case 'share-selection': await this.share('human',true);break;
      case 'task-open': {
        this.stop();this.state.workflow=null; const epoch = this.epoch; this.emit({ busy: true, message: '별도 AI 작업 페이지를 여는 중입니다.' });
        try { await this.host.openTask(command.url); if (epoch === this.epoch) this.emit({ busy: false, message: 'AI 작업 페이지를 열었습니다. 공유할 내용을 먼저 확인해 주세요.' }); }
        catch { if (epoch === this.epoch) this.emit({ busy: false, message: 'AI 작업 페이지를 열지 못했습니다.' }); } break;
      }
      case 'approve': await this.approve(); break;
    }
  }
  private stop(): void { this.resetWire();if(this.state.workflow?.status==='running')this.state.workflow.status='paused';this.host.stopTask?.(); this.invalidate(); this.dropContext(); this.emit({ busy: false, message: '중단했습니다. 이미 서버에 보낸 요청은 사용량이 발생했을 수 있습니다.' }); }
  private async connect(config: Connection, remember: boolean): Promise<void> {
    this.state.workflow=null;
    const epoch = this.invalidate(); this.dropContext();this.resetWire();this.nextRequest=0; this.config = undefined; this.history = []; this.conversationRequests = 0;
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
  private async share(source: 'human' | 'task' | 'controlled', selectionOnly=false): Promise<void> {
    this.stop(); const epoch = this.epoch; this.emit({ busy: true, message: '공유할 페이지 내용을 읽는 중입니다.' });
    try {
      const attachment = await this.host.capture(source,selectionOnly);
      if (epoch !== this.epoch) { attachment.dispose(); return; }
      this.attachment = attachment; this.emit({ busy: false, context: attachment.data, message: '아래 미리보기를 확인하세요. 다음 전송에만 페이지 내용이 포함됩니다.' });
    } catch { if (epoch === this.epoch) this.emit({ busy: false, message: '현재 페이지를 읽을 수 없습니다. HTTPS 페이지를 연 뒤 다시 시도해 주세요.' }); }
  }
  private async send(text: string): Promise<void> {
    if (!this.config || !this.state.model) { this.emit({ message: 'API 연결과 모델 선택이 필요합니다.' }); return; }
    if (this.now() < this.nextRequest) { this.emit({ message: '제공사의 Retry-After 대기 시간이 남아 있습니다. 잠시 후 다시 요청하세요.' }); return; }
    if (!this.state.context) this.dropContext();
    const options={...this.state.options};
    const continuous=this.state.workflow?.status==='running';
    const snapshot=this.attachment?modelSnapshot(this.attachment.data):null;
    if(!continuous||this.wireHistory.length>16||JSON.stringify(this.wireHistory).length>30000||snapshot&&this.previousPage&&(snapshot.document!==this.previousPage.document||snapshot.origin!==this.previousPage.origin||snapshot.source!==this.previousPage.source))this.resetWire();
    const history=continuous&&this.wireHistory.length?this.wireHistory:this.history;
    const frame=snapshot?chooseModelFrame(snapshot,continuous?this.previousPage:null):this.attachment?.data??null;
    const inputEstimate=Buffer.byteLength(JSON.stringify({history,text,context:frame}),'utf8')+20000;
    const reserve=estimatedCost({input:inputEstimate,output:options.maxOutput,cached:0},options);
    if(options.budget>0&&(options.inputPrice<=0||options.outputPrice<=0||this.state.estimatedCost+reserve>options.budget)) {this.emit({message:'설정한 추정 예산을 초과하거나 단가가 없어 요청을 중단했습니다. 단가와 예산을 확인하세요.'});return;}
    if(options.contextLimit>0&&inputEstimate+options.maxOutput>options.contextLimit){this.emit({message:'보수적으로 추정한 컨텍스트 길이가 설정 한도를 넘었습니다. 새 대화를 시작하거나 페이지 공유를 줄이세요.'});return;}
    const epoch = this.invalidate(), config = this.config, attachment = this.attachment;
    this.emit({ busy: true, proposal: null, message: 'AI 응답을 기다리는 중입니다.' });
    try {
      if (attachment && !await attachment.check()) { if (epoch === this.epoch) this.revokeContext(); return; }
      if (epoch !== this.epoch) return;
      this.conversationRequests++; this.state.requests++;
      this.emit({ messages: [...this.history, { role: 'user', content: safeText(text, 12000) }] });
      this.state.estimatedCost+=reserve;
      const started=this.now();
      const reply = await this.adapter.chat(config, this.state.model, history, text, frame, this.signal(), options,continuous?this.state.workflow?.lastOutcome??null:null);
      this.state.estimatedCost=Math.max(0,this.state.estimatedCost-reserve)+estimatedCost(reply.usage,options);
      if (epoch !== this.epoch) return;
      this.state.metrics={...this.state.metrics,captureMs:attachment?.data.captureMs??0,modelMs:Math.max(0,this.now()-started),contextBytes:frame?Buffer.byteLength(JSON.stringify(frame)):0,fullContextBytes:snapshot?Buffer.byteLength(JSON.stringify(snapshot)):0,frame:snapshot?(frame as {format:'snapshot'|'delta'}).format:'none'};
      if (attachment && !await attachment.check()) { this.revokeContext(); return; }
      if (epoch !== this.epoch) return;
      if(continuous&&snapshot){this.wireHistory=[...history,{role:'user',content:JSON.stringify({request:text,untrusted_page_context:frame,untrusted_execution_result:this.state.workflow?.lastOutcome??null})},{role:'assistant',content:reply.text}];this.previousPage=snapshot;}
      this.history.push({ role: 'user', content: safeText(text, 12000) }, { role: 'assistant', content: reply.text });
      while (this.history.length > 20 || this.history.reduce((n, m) => n + m.content.length, 0) > 45000) this.history.splice(0, 2);
      const action = attachment && attachment.data.source !== 'human' ? parseProposal(reply.action ?? (reply.click ? {op:'CLICK',target:reply.click,value:''} : null), attachment.data.origin) : null;
      const target = action?.target ? attachment?.data.elements.find(e => e.id === action.target && (!e.actions || e.actions.includes(action.op))) : null;
      const validProposal = action && (action.target ? !!target : true);
      this.emit({ busy: false, messages: [...this.history], usage: { input: this.state.usage.input + reply.usage.input, output: this.state.usage.output + reply.usage.output, cached: this.state.usage.cached + reply.usage.cached },
        contextRemaining:options.contextLimit>0?Math.max(0,options.contextLimit-reply.usage.input-reply.usage.output):null,
        context: null, proposal: validProposal ? { target: action.target, name: target?.name || action.op, origin: attachment!.data.origin, action } : null,
        message: validProposal ? 'AI가 동작을 제안했습니다. 실행 전 대상과 사이트를 확인하세요.' : '응답을 받았습니다.' });
      if (!validProposal) { this.dropContext();this.resetWire(); if(this.state.workflow?.status==='running'){this.state.workflow.status=reply.completed===true?'completed':'paused';if(reply.completed===true)this.host.completed?.();else this.state.message='모델이 다음 동작을 제안하지 않아 작업을 일시정지했습니다. 응답과 페이지 결과를 확인하세요.';}this.changed(); }
    } catch (error) { if (epoch === this.epoch) { if(error instanceof AiFailure&&error.code==='limit')this.nextRequest=this.now()+error.retryAfterMs;this.dropContext();this.resetWire();if(this.state.workflow)this.state.workflow.status='paused'; this.emit({ busy: false, message: this.failure(error) }); } }
  }
  private async approve(): Promise<void> {
    const attachment = this.attachment, proposal = this.state.proposal;
    if (!attachment || !proposal || attachment.data.source === 'human') return;
    const epoch = this.invalidate(); this.emit({ busy: true, proposal: null, message: '동작 승인 대기 중입니다.' });
    try {
      this.executing=true;
      this.state.metrics.interventions++;
      const result = attachment.act && proposal.action ? await attachment.act(proposal.action) : await attachment.click(proposal.target);
      if (epoch !== this.epoch) return;
      const ok=typeof result==='boolean'?result:result.ok&&result.matches!==false;
      this.state.metrics.actions++;if(!ok)this.state.metrics.failures++;
      if(this.state.workflow)this.state.workflow.lastOutcome={operation:proposal.action?.op||'CLICK',outcome:ok?(['READ','EXTRACT','VERIFY'].includes(proposal.action?.op||'')?'observed':'dispatched'):'blocked-or-unconfirmed',...(typeof result==='object'?{text:result.text?.slice(0,4096),matches:result.matches,reason:result.reason?.slice(0,80)}:{})};
      this.dropContext(); this.emit({ busy: false, message: ok ? '승인한 동작을 실행했습니다.' : '승인 취소 또는 페이지 변경으로 완료를 확인하지 못했습니다. 페이지를 확인한 뒤 계속하세요.' });
      this.executing=false;
      if(proposal.action?.op==='HANDOFF'){this.stop();this.host.handoff?.(attachment.data.source);return;}
      if(this.state.workflow?.status==='running') {if(ok)await this.advance();else {this.state.workflow.status='paused';this.changed();}}
    } catch { if (epoch === this.epoch) { this.dropContext();if(this.state.workflow)this.state.workflow.status='paused'; this.emit({ busy: false, message: '페이지 상태가 달라 실행하지 않았습니다.' }); } }
    finally {this.executing=false;}
  }
  private async startWorkflow(goal:string,limit:number):Promise<void> {
    if(!this.config||!this.state.model)return;
    this.stop();this.state.workflow=null;const epoch=this.epoch;this.emit({busy:true,message:'여러 단계 작업의 페이지 공유 승인을 기다립니다.'});
    let attachment:Attachment|undefined;
    try {
      attachment=await this.host.capture('task');
      if(epoch!==this.epoch||!await this.host.confirmWorkflow?.(attachment.data.origin)||!await attachment.check())return;
      if(epoch!==this.epoch)return;
      this.state.workflow={goal,limit,step:0,origin:attachment.data.origin,model:this.state.model,status:'running'};
    }catch{this.emit({message:'AI 작업 페이지를 먼저 열고 페이지 로딩을 완료하세요.'});}
    finally{attachment?.dispose();if(epoch===this.epoch)this.emit({busy:false});}
    if(epoch===this.epoch&&this.state.workflow)await this.advance();
  }
  private async advance():Promise<void> {
    const workflow=this.state.workflow;if(!workflow||!this.config)return;
    if(workflow.step>=workflow.limit){workflow.status='paused';this.emit({message:'설정한 단계 수에 도달했습니다. 결과를 확인하세요.'});return;}
    if(workflow.model!==this.state.model){workflow.status='paused';this.emit({message:'모델이 바뀌었습니다. 새 작업으로 시작하세요.'});return;}
    const epoch=this.invalidate();workflow.status='running';this.emit({busy:true,message:'다음 단계의 페이지를 확인합니다.'});
    let attachment:Attachment|undefined;
    try {
      // Honor only provider-requested backoff. Free ToastIR has no artificial delay.
      // Timers can wake early; revocation remains authoritative while waiting.
      while(this.now()<this.nextRequest){
        await new Promise(resolve=>setTimeout(resolve,Math.max(1,Math.ceil(this.nextRequest-this.now()))));
        if(epoch!==this.epoch)return;
      }
      if(epoch!==this.epoch)return;
      attachment=await this.host.capture('task');
      if(epoch!==this.epoch||attachment.data.origin!==workflow.origin||!await attachment.check()){attachment.dispose();if(epoch===this.epoch){workflow.status='paused';this.emit({busy:false,message:'사이트가 바뀌었습니다. 새 작업으로 시작해 공유 범위를 다시 승인하세요.'});}return;}
      if(epoch!==this.epoch){attachment.dispose();return;}
      this.dropContext();this.attachment=attachment;this.state.context=attachment.data;workflow.step++;
      await this.send(`${workflow.goal}\n작업 단계 ${workflow.step}/${workflow.limit}. 이전 실행기 결과: ${JSON.stringify(workflow.lastOutcome?{operation:workflow.lastOutcome.operation,outcome:workflow.lastOutcome.outcome}:null)}. dispatched는 DOM 동작 전달이며 사이트의 처리 성공이 아닙니다. 현재 페이지를 확인하고 다음 동작 하나를 제안하세요. 이전 동작이 성공했다고 추측하거나 같은 제출을 반복하지 마세요. 완료 근거가 있다면 action:null, done:true로 결과를 설명하세요. 불확실하면 done:false로 설명하고 멈추세요.`.slice(0,12000));
      if(epoch===this.epoch&&this.state.busy){workflow.status='paused';this.emit({busy:false});}
    }catch{attachment?.dispose();if(epoch===this.epoch){workflow.status='paused';this.emit({busy:false,message:'페이지 확인이 실패했습니다. 상태를 확인하고 계속하세요.'});}}
  }
  dispose(): void { this.invalidate(); this.dropContext();this.resetWire(); this.config = undefined; this.history = []; this.disposed = true; }
}
