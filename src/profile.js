'use strict';
window.createProfileEditor=()=>{
  const $=id=>document.getElementById(id);
  const defaults=()=>({theme:'dark',accent:'blue',background:'theme',textSize:'default',density:'comfortable',corners:'soft',motion:'system'});
  const keys=Object.keys(defaults());
  let state=null,revision='',avatar='toast',dirty=false,pending=false,reloading=false,section='profile',conflict=false;
  const readAppearance=()=>Object.fromEntries(keys.map(key=>[key,$('appearance-'+key).value]));
  function preview(){
    const options=readAppearance();window.renderAppearance($('appearance-preview'),options,matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light');
    $('preview-greeting').textContent=$('profile-name').value.trim()?`${$('profile-name').value.trim()}님의 브라우저`:'어디로 떠나볼까요?';
    $('profile-counter').textContent=`${Array.from($('profile-bio').value).length} / 160`;
    for(const button of document.querySelectorAll('[data-avatar]'))button.setAttribute('aria-pressed',String(button.dataset.avatar===avatar));
    $('profile-dirty').textContent=conflict?'계정 설정이 바뀌었어요. 변경 취소 또는 다시 불러오기를 눌러 주세요.':dirty?'저장하지 않은 변경사항':state?.syncEnabled?'계정에 동기화된 설정':state?.storageAvailable?'이 기기에 저장된 설정':'이번 실행에 적용된 설정';
    $('profile-save').disabled=!!state?.busy||conflict;
  }
  function fill(profile){
    $('profile-name').value=profile?.name||'';$('profile-bio').value=profile?.bio||'';avatar=profile?.avatar||'toast';
    for(const key of keys)$('appearance-'+key).value=profile?.appearance?.[key]||defaults()[key];
    $('profile-name').setCustomValidity('');$('profile-bio').setCustomValidity('');dirty=false;conflict=false;preview();
  }
  function select(next){
    section=next;
    for(const tab of ['profile','appearance','security']){$(tab+'-tab').setAttribute('aria-selected',String(tab===section));$(tab+'-tab').tabIndex=tab===section?0:-1;$(tab+'-panel').hidden=tab!==section;}
    $('profile-form').hidden=section==='security';
  }
  for(const tab of ['profile','appearance','security']){
    $(tab+'-tab').onclick=()=>select(tab);
    $(tab+'-tab').onkeydown=e=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();const tabs=['profile','appearance','security'];let i=tabs.indexOf(section);i=e.key==='Home'?0:e.key==='End'?2:(i+(e.key==='ArrowRight'?1:2))%3;select(tabs[i]);$(tabs[i]+'-tab').focus();};
  }
  $('profile-form').oninput=()=>{dirty=true;$('profile-name').setCustomValidity('');$('profile-bio').setCustomValidity('');preview();};
  for(const button of document.querySelectorAll('[data-avatar]'))button.onclick=()=>{avatar=button.dataset.avatar;dirty=true;preview();};
  $('appearance-reset').onclick=()=>{for(const key of keys)$('appearance-'+key).value=defaults()[key];dirty=true;preview();};
  $('profile-discard').onclick=()=>{revision=state?.profileRevision||'';fill(state?.profile);};
  $('profile-reload').onclick=()=>{if(!state||state.busy)return;reloading=true;window.account.command({type:'profile-reload',revision:state.profileRevision});};
  $('profile-form').onsubmit=event=>{
    event.preventDefault();if(!state||state.busy||state.status!=='signed-in')return;
    const name=$('profile-name').value.normalize('NFC').trim(),bio=$('profile-bio').value.normalize('NFC').trim();
    if(Array.from(name).length>32||/[\u0000-\u001f\u007f-\u009f\u200b\u200e-\u200f\u202a-\u202e\u2066-\u2069\ufeff]/u.test(name)){select('profile');$('profile-name').setCustomValidity('표시할 수 있는 문자로 32자 이내 입력해 주세요.');$('profile-name').reportValidity();return;}
    if(Array.from(bio).length>160||/[\u0000-\u0009\u000b-\u001f\u007f-\u009f\u200b\u200e-\u200f\u202a-\u202e\u2066-\u2069\ufeff]/u.test(bio)){select('profile');$('profile-bio').setCustomValidity('표시할 수 있는 문자로 160자 이내 입력해 주세요.');$('profile-bio').reportValidity();return;}
    pending=true;window.account.command({type:'profile-save',revision,profile:{version:1,name,bio,avatar,appearance:readAppearance()}});
  };
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change',preview);
  return next=>{
    const wasSignedIn=state?.status==='signed-in';state=next;
    if(state.status!=='signed-in'){
      revision='';pending=false;reloading=false;fill(null);select('profile');$('profile-title').textContent='';$('profile-avatar').textContent='';$('profile-warning').textContent='';return;
    }
    const changed=revision!==state.profileRevision;
    if(!wasSignedIn||(changed&&(!dirty||pending||reloading))){revision=state.profileRevision;fill(state.profile);}
    else if(changed){conflict=true;preview();}
    if(!state.busy){pending=false;reloading=false;}
    $('profile-title').textContent=state.profile?.name||'내 프로필';$('profile-avatar').replaceChildren(window.icons.profile(state.profile?.avatar));
    $('profile-warning').textContent=state.profileWarning||'';$('profile-warning').hidden=!state.profileWarning;
    for(const control of document.querySelectorAll('#profile-form input,#profile-form select,#profile-form textarea,#profile-form button,#profile-reload'))control.disabled=state.busy;
    $('profile-save').disabled=state.busy||conflict;
    if(state.recovering)select('security');else select(section);
  };
};
