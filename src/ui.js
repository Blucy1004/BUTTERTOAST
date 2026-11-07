'use strict';
const send = (type, extra = {}) => window.browser.command({ type, ...extra });
const renderToolbar = window.initToolbar(send);
document.getElementById('new').onclick = () => send('new');
window.browser.onState(state => { window.renderTabs(state, send); renderToolbar(state); });
document.addEventListener('keydown', e => {
  if (!(e.ctrlKey || e.metaKey)) return;
  if (e.key.toLowerCase() === 'l') { e.preventDefault(); const input = document.getElementById('address'); input.focus(); input.select(); }
  else if (e.key.toLowerCase() === 't') { e.preventDefault(); send('new'); }
});
send('ready');
