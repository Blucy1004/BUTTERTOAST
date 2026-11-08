'use strict';
(() => {
  const el = id => document.getElementById(id);
  let mode = 'login', state = { configured: false, busy: true, status: 'signed-out' };
  function clearPassword() {
    for (const id of ['current-password','new-password','new-password-confirm','reauth-code']) el(id).value = '';
    el('password').value = ''; el('password-confirm').value = ''; el('password-confirm').setCustomValidity('');
    el('password').setCustomValidity('');
    el('show-password').checked = false; el('password').type = 'password'; el('password-confirm').type = 'password';
  }
  function render() {
    const signedIn = state.status === 'signed-in', signup = mode === 'signup';
    el('auth-form').hidden = signedIn; el('auth-modes').hidden = signedIn; el('signed-in').hidden = !signedIn;
    el('recover').hidden = signedIn; el('recover').disabled = state.busy;
    for (const id of ['reauthenticate','password-update']) el(id).disabled = state.busy;
    el('signed-in-email').textContent = signedIn ? state.email : '';
    el('confirm-field').hidden = !signup; el('password-confirm').required = signup;
    el('password').minLength = signup ? 8 : 1; el('password').autocomplete = signup ? 'new-password' : 'current-password';
    el('password-hint').textContent = signup ? '(8자 이상)' : '';
    el('mode-login').setAttribute('aria-pressed', String(!signup)); el('mode-signup').setAttribute('aria-pressed', String(signup));
    el('submit').textContent = state.busy ? '처리 중…' : signup ? '회원가입' : '로그인';
    for (const id of ['email', 'password', 'password-confirm', 'submit', 'mode-login', 'mode-signup', 'show-password']) el(id).disabled = !state.configured || state.busy;
    el('logout').hidden = state.status === 'signed-out' && !state.busy;
    el('logout').textContent = signedIn ? '로그아웃' : '인증 대기 취소';
    el('account-message').textContent = state.message || '';
  }
  for (const choice of ['login', 'signup']) el(`mode-${choice}`).onclick = () => { mode = choice; clearPassword(); render(); el('email').focus(); };
  el('show-password').onchange = () => { for (const id of ['password', 'password-confirm']) el(id).type = el('show-password').checked ? 'text' : 'password'; };
  for (const id of ['password', 'password-confirm']) el(id).oninput = () => { el('password-confirm').setCustomValidity(''); el('password').setCustomValidity(''); };
  el('auth-form').onsubmit = event => {
    event.preventDefault(); if (state.busy || !state.configured) return;
    if (mode === 'signup' && Array.from(el('password').value).length < 8) {
      el('password').setCustomValidity('비밀번호는 8자 이상 입력해 주세요.'); el('password').reportValidity(); return;
    }
    if (mode === 'signup' && el('password').value !== el('password-confirm').value) {
      el('password-confirm').setCustomValidity('비밀번호가 일치하지 않습니다.'); el('password-confirm').reportValidity(); return;
    }
    const command = { type: mode, email: el('email').value, password: el('password').value };
    clearPassword(); window.account.command(command);
  };
  el('recover').onclick = () => { const email=el('email').value; clearPassword(); window.account.command({type:'recover',email}); };
  el('reauthenticate').onclick = () => window.account.command({type:'reauthenticate'});
  el('password-form').onsubmit = event => { event.preventDefault(); if(state.busy)return; if(Array.from(el('new-password').value).length<8){el('new-password').setCustomValidity('비밀번호는 8자 이상 입력해 주세요.');el('new-password').reportValidity();return;} if(el('new-password').value!==el('new-password-confirm').value){el('new-password-confirm').setCustomValidity('비밀번호가 일치하지 않습니다.');el('new-password-confirm').reportValidity();return;} const command={type:'password-update',password:el('new-password').value,currentPassword:el('current-password').value,nonce:el('reauth-code').value}; clearPassword(); window.account.command(command); };
  el('new-password').oninput=()=>el('new-password').setCustomValidity('');
  el('new-password-confirm').oninput=()=>el('new-password-confirm').setCustomValidity('');
  el('logout').onclick = () => { clearPassword(); window.account.command({ type: 'logout' }); };
  window.account.onState(next => { const previous=state.status; state = next; if (state.status === 'signed-in' && previous !== 'signed-in') clearPassword(); render(); });
  window.addEventListener('pagehide', clearPassword);
  render(); window.account.command({ type: 'state' });
})();
