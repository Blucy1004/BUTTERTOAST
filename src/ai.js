'use strict';
(() => {
  const el = id => document.getElementById(id), send = (type, extra = {}) => window.ai.command({ type, ...extra });
  const settings = window.initAiSettings(send); let state, transcript = '';
  for (const type of ['clear', 'hide', 'task-close', 'remove-context', 'approve', 'reject', 'continue-task', 'handoff', 'save-chat', 'load-chat', 'delete-chat']) el(type).onclick = () => send(type);
  el('options-form').onsubmit = event => { event.preventDefault(); send('options', {options:{maxOutput:Number(el('max-output').value),reasoning:el('reasoning').value,contextLimit:Number(el('context-limit').value),inputPrice:Number(el('input-price').value),cachedPrice:Number(el('cached-price').value),outputPrice:Number(el('output-price').value),budget:Number(el('budget').value)}}); };
  el('ai-stop').onclick = () => send('stop');
  el('share-human').onclick = () => send('share', { source: 'human' }); el('share-task').onclick = () => send('share', { source: 'task' });
  el('share-control').onclick = () => send('share', {source:'controlled'});
  el('workflow-form').onsubmit = event => {event.preventDefault();send('run-task',{goal:el('goal').value,steps:Number(el('steps').value)});};
  el('choose-model').onclick = () => send('model', { model: el('model').value.trim() });
  el('task-form').onsubmit = event => { event.preventDefault(); send('task-open', { url: el('task-url').value }); };
  el('chat-form').onsubmit = event => { event.preventDefault(); if (!state || state.busy || !state.connected) return; const text = el('prompt').value.trim(); if (!text) return; el('prompt').value = ''; send('send', { text }); };
  window.ai.onState(next => {
    state = next; settings(state);
    el('save-chat').disabled=state.busy||!state.storageAvailable;el('load-chat').disabled=state.busy||!state.storageAvailable;el('delete-chat').disabled=state.busy;
    el('cost').textContent = `${state.options.inputPrice > 0 || state.options.outputPrice > 0 ? '추정 누적 $'+state.estimatedCost.toFixed(6) : '단가 미설정'} · 컨텍스트 잔여 ${state.contextRemaining === null ? '모름' : state.contextRemaining+' 토큰 (입력 한도 기준)'}`;
    el('workflow-status').textContent=state.workflow ? `${state.workflow.status} · ${state.workflow.step}/${state.workflow.limit} 단계 · ${state.workflow.origin}` : '작업 없음';
    el('continue-task').disabled=state.busy || state.workflow?.status!=='paused';
    el('run-task').disabled=state.busy || !state.connected;
    el('share-control').disabled=state.busy;
    el('send').disabled = state.busy || !state.connected || !state.model;
    for (const id of ['share-human', 'share-task', 'task-open', 'approve']) el(id).disabled = state.busy;
    el('context').hidden = !state.context;
    el('context-origin').textContent = state.context ? `${state.context.source === 'human' ? '현재 탭 읽기' : state.context.source === 'controlled' ? '현재 탭 제어 공유' : 'AI 작업'} · ${state.context.origin}` : '';
    el('context-preview').textContent = state.context ? `${state.context.text}\n\n${state.context.elements.map(e => `[${e.id}] ${e.name}`).join('\n')}` : '';
    el('proposal').hidden = !state.proposal;
    el('proposal-description').textContent = state.proposal ? `${state.proposal.origin}\n${state.proposal.action?.op || "CLICK"} 제안: ${state.proposal.name}\n${state.proposal.action?.value || ""}` : '';
    el('ai-message').textContent = state.message;
    el('usage').textContent = `응답에 보고된 사용량 · 입력 ${state.usage.input.toLocaleString()} / 출력 ${state.usage.output.toLocaleString()} / 입력 중 캐시 ${state.usage.cached.toLocaleString()} 토큰 · 요청 ${state.requests}회`;
    const serialized = JSON.stringify(state.messages);
    if (serialized !== transcript) {
      transcript = serialized; el('messages').replaceChildren(...state.messages.map(m => {
        const item = document.createElement('div'); item.className = 'message'; const role = document.createElement('strong'); role.textContent = m.role === 'user' ? '나' : 'AI'; const content = document.createElement('p'); content.textContent = m.content; item.append(role, content); return item;
      })); el('messages').lastElementChild?.scrollIntoView({ block: 'nearest' });
    }
  });
  send('ready');
})();
