'use strict';
window.renderTabs = (state, send) => {
  const container = document.getElementById('tabs');
  container.replaceChildren();
  for (const tab of state.tabs) {
    const wrap = document.createElement('span'); wrap.className = 'tab' + (tab.id === state.active ? ' active' : '');
    const select = document.createElement('button'); select.textContent = tab.title; select.title = tab.title; select.onclick = () => send('select', { id: tab.id });
    const close = document.createElement('button'); close.textContent = '×'; close.setAttribute('aria-label', `${tab.title} 닫기`); close.onclick = () => send('close', { id: tab.id });
    wrap.append(select, close); container.append(wrap);
  }
};
