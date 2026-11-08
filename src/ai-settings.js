'use strict';
window.initAiSettings = send => {
  const el = id => document.getElementById(id);
  const endpoints = { openai: 'https://api.openai.com/v1', anthropic: 'https://api.anthropic.com/v1', gemini: 'https://generativelanguage.googleapis.com/v1beta', compatible: 'http://127.0.0.1:1234/v1' };
  const clear = () => { el('api-key').value = ''; };
  el('provider').onchange = () => { clear(); el('endpoint').value = endpoints[el('provider').value]; el('endpoint').readOnly = el('provider').value !== 'compatible'; };
  el('endpoint').readOnly = true;
  el('connection-form').onsubmit = event => {
    event.preventDefault();
    const config = { provider: el('provider').value, endpoint: el('endpoint').value, key: el('api-key').value, remember: el('remember').checked };
    clear(); send('connect', config);
  };
  el('restore').onclick = () => { clear(); send('restore', { provider: el('provider').value }); };
  el('forget').onclick = () => { clear(); send('forget', { provider: el('provider').value }); };
  window.addEventListener('pagehide', clear);
  let previousModels = '', previousModel = '', connection = ''; let wasConnected = false;
  return state => {
    const currentConnection = state.provider + ':' + state.endpoint;
    if (state.connected && currentConnection !== connection) {
      connection = currentConnection; el('provider').value = state.provider; el('endpoint').value = state.endpoint; el('endpoint').readOnly = state.provider !== 'compatible';
    }
    if (state.connected && !wasConnected) el('settings').open = false;
    wasConnected = state.connected;
    el('active-connection').textContent = state.connected ? `현재 연결: ${state.endpoint}` : '연결되지 않음';
    for (const id of ['provider', 'endpoint', 'api-key', 'connect', 'restore']) el(id).disabled = state.busy;
    el('remember').disabled = state.busy || !state.storageAvailable;
    if (!state.storageAvailable) el('remember').checked = false;
    el('storage-hint').textContent = state.storageAvailable ? '저장하지 않으면 이번 실행 중에만 키를 사용합니다.' : '이 환경에서는 OS 암호화 저장을 사용할 수 없습니다. 키는 이번 실행 중에만 사용합니다.';
    const models = JSON.stringify(state.models);
    if (models !== previousModels) { el('models').replaceChildren(...state.models.map(id => { const o = document.createElement('option'); o.value = id; return o; })); previousModels = models; }
    if (state.model !== previousModel) { el('model').value = state.model; previousModel = state.model; }
    el('model').disabled = state.busy || !state.connected; el('choose-model').disabled = state.busy || !state.connected;
  };
};
