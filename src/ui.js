'use strict';
const send = (type, extra = {}) => window.browser.command({ type, ...extra });
const renderToolbar = window.initToolbar(send);
let current;
document.getElementById('account-open').onclick = () => send('account-open');
document.getElementById('new').onclick = () => send('new');
document.getElementById('reopen').onclick = () => send('reopen');
for (const [id, delta] of [['move-left', -1], ['move-right', 1]]) {
  document.getElementById(id).onclick = () => current && send('move', { id: current.active, delta });
}
window.browser.onState(state => {
  document.getElementById('account-open').disabled = !state.initialized;
  document.getElementById('account-open').textContent = state.accountSignedIn ? '계정' : '로그인';
  current = state; window.renderTabs(state, send); renderToolbar(state);
  document.getElementById('new').disabled = !state.initialized || state.tabs.length >= 30;
  document.getElementById('reopen').disabled = !state.initialized || !state.canReopen || state.tabs.length >= 30;
  const index = state.tabs.findIndex(tab => tab.id === state.active);
  document.getElementById('move-left').disabled = index <= 0;
  document.getElementById('move-right').disabled = index < 0 || index >= state.tabs.length - 1;
});
window.browser.onFocusAddress(() => { const input = document.getElementById('address'); input.focus(); input.select(); });
send('ready');
