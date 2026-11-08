'use strict';
const tabStatus = { loading: '로딩 중', slow: '로딩 지연', unresponsive: '응답 없음', crashed: '종료됨', suspended: '복원 대기' };
window.renderTabs = (state, send, filter='') => {
  const container = document.getElementById('tabs');
  container.replaceChildren();
  for (const tab of state.tabs) {
    if(filter&&!`${tab.title} ${tab.host}`.toLocaleLowerCase().includes(filter.toLocaleLowerCase()))continue;
    const wrap = document.createElement('span'); wrap.className = 'tab' + (tab.id === state.active ? ' active' : '');
    wrap.classList.toggle('pinned',tab.pinned);
    wrap.draggable = false; wrap.dataset.tabId = String(tab.id);
    const select = document.createElement('button');
    select.textContent = state.layout?.compact ? String(state.tabs.indexOf(tab)+1) : `${tab.pinned?'• ':''}${tab.muted?'[음소거] ':tab.audible?'[재생] ':''}`+(tabStatus[tab.status] ? `[${tabStatus[tab.status]}] ` : '') + tab.title;
    select.title = `${tab.title}\n${tab.host||''}`; select.setAttribute('role', 'tab'); select.setAttribute('aria-selected', String(tab.id === state.active));
    select.onclick = () => send('select', { id: tab.id });
    const close = document.createElement('button'); close.textContent = '×'; close.setAttribute('aria-label', `${tab.title} 닫기`); close.onclick = () => send('close', { id: tab.id });
    const delegate = document.createElement('button'); delegate.className='send-tab';delegate.textContent='↗';delegate.title='Toast에 보내기';delegate.setAttribute('aria-label',`${tab.title} Toast에 보내기`);delegate.onclick=()=>send('delegate',{id:tab.id});
    const menu=document.createElement('button');menu.className='tab-menu';menu.textContent='⋯';menu.setAttribute('aria-label',`${tab.title} 탭 메뉴`);menu.onclick=()=>send('tab-menu',{id:tab.id});
    wrap.oncontextmenu=e=>{e.preventDefault();send('tab-menu',{id:tab.id});};
    wrap.append(select, delegate, menu, close); container.append(wrap);
  }
  document.getElementById('tab-empty').hidden=container.childElementCount>0;
};
