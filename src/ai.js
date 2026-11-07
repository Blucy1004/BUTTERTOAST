'use strict';
(() => {
  const el = id => document.getElementById(id), send = (type, extra = {}) => window.ai.command({ type, ...extra });
  const settings = window.initAiSettings(send); let state, transcript = '';
  for (const type of ['clear', 'hide', 'task-close', 'remove-context', 'approve', 'reject']) el(type).onclick = () => send(type);
  el('ai-stop').onclick = () => send('stop');
  el('share-human').onclick = () => send('share', { source: 'human' }); el('share-task').onclick = () => send('share', { source: 'task' });
  el('choose-model').onclick = () => send('model', { model: el('model').value.trim() });
  el('task-form').onsubmit = event => { event.preventDefault(); send('task-open', { url: el('task-url').value }); };
  el('chat-form').onsubmit = event => { event.preventDefault(); if (!state || state.busy || !state.connected) return; const text = el('prompt').value.trim(); if (!text) return; el('prompt').value = ''; send('send', { text }); };
  window.ai.onState(next => {
    state = next; settings(state);
    el('send').disabled = state.busy || !state.connected || !state.model;
    for (const id of ['share-human', 'share-task', 'task-open', 'approve']) el(id).disabled = state.busy;
    el('context').hidden = !state.context;
    el('context-origin').textContent = state.context ? `${state.context.source === 'human' ? '현재 탭' : 'AI 작업'} · ${state.context.origin}` : '';
    el('context-preview').textContent = state.context ? `${state.context.text}\n\n${state.context.elements.map(e => `[${e.id}] ${e.name}`).join('\n')}` : '';
    el('proposal').hidden = !state.proposal;
    el('proposal-description').textContent = state.proposal ? `${state.proposal.origin}\n클릭 제안: ${state.proposal.name}` : '';
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
