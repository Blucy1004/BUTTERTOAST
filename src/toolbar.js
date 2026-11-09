'use strict';
window.initToolbar = send => {
  const $ = id => document.getElementById(id);
  for (const id of ['back', 'forward', 'reload', 'stop', 'restart', 'suspend', 'privacy-toggle']) $(id).onclick = () => send(id);
  let suggestTimer,renderedActive;
  $('address').addEventListener('input',()=>{clearTimeout(suggestTimer);$('address-suggestions').replaceChildren();const query=$('address').value;suggestTimer=setTimeout(()=>send('suggest',{query:query.slice(0,256)}),100);});
  window.browser.onSuggestions(state=>{if(state.query!==$('address').value||document.activeElement!==$('address'))return;$('address-suggestions').replaceChildren(...state.items.map(item=>{const option=document.createElement('option');option.value=item.url;option.label=(item.source==='bookmark'?'북마크 · ':'방문 기록 · ')+item.title;return option;}));});
  $('address').addEventListener('blur',()=>{clearTimeout(suggestTimer);$('address-suggestions').replaceChildren();});
  $('address-form').onsubmit = event => { event.preventDefault(); send('navigate', { address: $('address').value }); $('address').blur(); };
  return state => {
    if (document.activeElement !== $('address') || renderedActive !== state.active) $('address').value = state.url;
    renderedActive=state.active;
    $('address').disabled = !state.initialized;
    $('back').disabled = !state.canBack; $('forward').disabled = !state.canForward;
    $('reload').disabled = !state.initialized || state.status === 'suspended';
    $('stop').disabled = !state.loading;
    $('restart').disabled = !state.initialized;
    $('suspend').disabled = !state.initialized || ['suspended', 'crashed'].includes(state.status);
    $('privacy-toggle').disabled = !state.initialized || !/^https?:/.test(state.url);
    $('privacy-toggle').textContent = state.privacyEnabled ? '추적 차단' : '차단 예외';
    $('privacy-toggle').setAttribute('aria-pressed', String(state.privacyEnabled));
    $('security').textContent = state.url.startsWith('https://') ? 'HTTPS' : state.url.startsWith('http://') ? '주의: HTTP' : '';
    const storageMessage = state.sessionStatus === 'unavailable' ? '보호 저장소를 사용할 수 없어 종료 후 탭·패널 너비를 복원할 수 없습니다.' : state.sessionStatus === 'failed' ? '탭 목록 저장·복원에 실패했습니다.' : '';
    $('message').textContent = !state.initialized ? '탭 목록 준비 중…' : state.error || (state.loading ? '불러오는 중…' : storageMessage);
  };
};
