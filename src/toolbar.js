'use strict';
window.initToolbar = send => {
  const $ = id => document.getElementById(id);
  for (const id of ['back', 'forward', 'reload']) $(id).onclick = () => send(id);
  $('address-form').onsubmit = event => { event.preventDefault(); send('navigate', { address: $('address').value }); $('address').blur(); };
  return state => {
    if (document.activeElement !== $('address')) $('address').value = state.url;
    $('back').disabled = !state.canBack; $('forward').disabled = !state.canForward;
    $('security').textContent = state.url.startsWith('https://') ? 'HTTPS' : state.url.startsWith('http://') ? '주의: HTTP' : '';
    $('message').textContent = state.error || (state.loading ? '불러오는 중…' : '');
  };
};
