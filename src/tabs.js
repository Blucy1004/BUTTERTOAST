'use strict';
const tabStatus = { loading: '로딩 중', slow: '로딩 지연', unresponsive: '응답 없음', crashed: '종료됨', suspended: '복원 대기' };
window.renderTabs = (state, send) => {
  const container = document.getElementById('tabs');
  container.replaceChildren();
  for (const tab of state.tabs) {
    const wrap = document.createElement('span'); wrap.className = 'tab' + (tab.id === state.active ? ' active' : '');
    const select = document.createElement('button');
    select.textContent = (tabStatus[tab.status] ? `[${tabStatus[tab.status]}] ` : '') + tab.title;
    select.title = select.textContent; select.setAttribute('role', 'tab'); select.setAttribute('aria-selected', String(tab.id === state.active));
    select.onclick = () => send('select', { id: tab.id });
    const close = document.createElement('button'); close.textContent = '×'; close.setAttribute('aria-label', `${tab.title} 닫기`); close.onclick = () => send('close', { id: tab.id });
    wrap.append(select, close); container.append(wrap);
  }
};
