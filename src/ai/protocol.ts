import { exactKeys, record } from '../security/ipc';
import { parseAction, Op } from '../security/guard';
import { ModelOptions, parseOptions } from './options';
export type Provider = 'openai' | 'anthropic' | 'gemini' | 'compatible';
export type Connection = { provider: Provider; endpoint: string; key: string };
export const endpoints = { openai: 'https://api.openai.com/v1', anthropic: 'https://api.anthropic.com/v1', gemini:'https://generativelanguage.googleapis.com/v1beta', compatible: 'http://127.0.0.1:1234/v1' };
export function isProvider(value: unknown): value is Provider { return value === 'openai' || value === 'anthropic' || value === 'gemini' || value === 'compatible'; }
export function modelId(value: unknown): value is string { return typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:/@-]{0,199}$/.test(value); }
export function parseConnection(provider: unknown, endpoint: unknown, key: unknown): Connection | null {
  if (!isProvider(provider) || typeof endpoint !== 'string' || endpoint.length > 2048 || typeof key !== 'string' || key.length > 4096 || /[^\x21-\x7e]/.test(key)) return null;
  try {
    const u = new URL(endpoint);
    if (u.username || u.password || u.search || u.hash || /%|\\/.test(endpoint) || !['http:', 'https:'].includes(u.protocol)) return null;
    if (u.protocol === 'http:' && !['127.0.0.1', '[::1]', 'localhost'].includes(u.hostname)) return null;
    const normalized = u.href.replace(/\/+$/, '');
    if (provider !== 'compatible' && (normalized !== endpoints[provider] || key.length < 8)) return null;
    return Object.freeze({ provider, endpoint: normalized, key });
  } catch { return null; }
}
export type AiCommand = { type: 'ready' | 'hide' | 'stop' | 'clear' | 'remove-context' | 'task-close' | 'approve' | 'reject' | 'continue-task' | 'handoff' | 'save-chat' | 'load-chat' | 'delete-chat' }
  | { type: 'connect'; provider: Provider; endpoint: string; key: string; remember: boolean }
  | { type: 'restore' | 'forget'; provider: Provider }
  | { type: 'model'; model: string } | { type: 'send'; text: string }
  | { type: 'options'; options: ModelOptions }
  | { type: 'share'; source: 'human' | 'task' | 'controlled' } | { type: 'task-open'; url: string }
  | {type:'run-task';goal:string;steps:number};
export function parseAiCommand(value: unknown): AiCommand | null {
  if (!record(value)) return null;
  if (value.type === 'options' && exactKeys(value,['type','options'])) { const options=parseOptions(value.options); return options ? {type:'options',options} : null; }
  if (['ready', 'hide', 'stop', 'clear', 'remove-context', 'task-close', 'approve', 'reject', 'continue-task', 'handoff', 'save-chat', 'load-chat', 'delete-chat'].includes(value.type as string) && exactKeys(value, ['type'])) return { type: value.type } as AiCommand;
  if(value.type==='run-task'&&exactKeys(value,['type','goal','steps'])&&typeof value.goal==='string'&&value.goal.trim().length>0&&value.goal.length<=12000&&Number.isSafeInteger(value.steps)&&(value.steps as number)>=1&&(value.steps as number)<=10)return {type:'run-task',goal:value.goal.trim(),steps:value.steps as number};
  if (value.type === 'connect' && exactKeys(value, ['type', 'provider', 'endpoint', 'key', 'remember']) && typeof value.remember === 'boolean') {
    const connection = parseConnection(value.provider, value.endpoint, value.key);
    return connection ? { type: 'connect', ...connection, remember: value.remember } : null;
  }
  if ((value.type === 'restore' || value.type === 'forget') && exactKeys(value, ['type', 'provider']) && isProvider(value.provider)) return { type: value.type, provider: value.provider };
  if (value.type === 'model' && exactKeys(value, ['type', 'model']) && modelId(value.model)) return { type: 'model', model: value.model };
  if (value.type === 'send' && exactKeys(value, ['type', 'text']) && typeof value.text === 'string' && value.text.trim().length > 0 && value.text.length <= 12000) return { type: 'send', text: value.text.trim() };
  if (value.type === 'share' && exactKeys(value, ['type', 'source']) && ['human', 'task', 'controlled'].includes(value.source as string)) return { type: 'share', source: value.source as 'human' | 'task' | 'controlled' };
  if (value.type === 'task-open' && exactKeys(value, ['type', 'url']) && typeof value.url === 'string' && value.url.length <= 4096) {
    try { const url = new URL(value.url); if (url.protocol === 'https:' && !url.username && !url.password) return { type: 'task-open', url: url.href }; } catch {}
  }
  return null;
}
export type ChatMessage = { role: 'user' | 'assistant'; content: string };
export type Usage = { input: number; output: number; cached: number };
export type Proposal = { op: Op; target: string; value: string };
export function parseProposal(value: unknown, origin = 'https://proposal.invalid'): Proposal | null {
  if (!record(value) || !exactKeys(value, ['op','target','value'])) return null;
  const action = parseAction({ ...value, protocol:2, document:'proposal_document_0001', id:'proposal', tab:1, origin, version:0 });
  return action ? {op:action.op,target:action.target,value:action.value} : null;
}
export type ModelReply = { text: string; click: string | null; action?: Proposal | null; usage: Usage };
export function safeText(value: string, max: number): string { return value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\u202a-\u202e\u2066-\u2069]/g, '').slice(0, max); }
