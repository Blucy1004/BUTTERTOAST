'use strict';
const $=id=>document.getElementById(id),send=(type,data={})=>window.browser.command({type,...data});
for(const id of ['back','forward','reload','stop'])$(id).onclick=()=>send(id);
$('address-form').onsubmit=e=>{e.preventDefault();send('navigate',{address:$('address').value});$('address').blur();};
window.browser.onState(state=>{if(document.activeElement!==$('address'))$('address').value=state.url;$('back').disabled=!state.canBack;$('forward').disabled=!state.canForward;$('stop').disabled=!state.loading;$('security').textContent=state.url.startsWith('https:')?'HTTPS':state.url?'HTTP':'';$('message').textContent=state.error||(!state.url?'이 창은 일반 브라우징용입니다. AI 작업과 세션 복원은 기본 창에서 사용할 수 있습니다.':'');document.title=(state.tabs.find(t=>t.id===state.active)?.title||'새 창')+' · ButterToast';});
window.browser.onFocusAddress(()=>{$('address').focus();$('address').select();});send('ready');
