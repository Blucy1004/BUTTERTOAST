'use strict';
const $ = id => document.getElementById(id);
const send = (type, extra = {}) => window.manager.command({ type, ...extra });
let current, settingsDirty = false;
function show(section) { if (!['bookmarks','history','downloads','settings','audit'].includes(section)) return; document.querySelectorAll('main > section').forEach(e => { e.hidden = e.id !== section; }); }
for (const button of document.querySelectorAll('[data-section]')) button.onclick = () => show(button.dataset.section);
for (const id of ['bookmark-current','history-clear','audit-clear','default-browser','clear-site-data','update-check','update-install']) $(id).onclick = () => send(id);
function button(parent, label, fn) { const b = document.createElement('button'); b.textContent = label; b.onclick = fn; parent.append(b); }
function row(parent, title, detail) { const e = document.createElement('div'); e.className = 'entry'; const t = document.createElement('div'); t.textContent = title; const d = document.createElement('div'); d.className = 'detail'; d.textContent = detail; e.append(t,d); parent.append(e); return e; }
function entries(kind) {
  const bookmark = kind === 'bookmarks', list = $(bookmark ? 'bookmark-list' : 'history-list'); list.replaceChildren();
  const query = $(bookmark ? 'bookmark-filter' : 'history-filter').value.toLocaleLowerCase();
  for (const entry of current[kind].filter(e => `${e.title} ${e.url}`.toLocaleLowerCase().includes(query)).slice(0, 300)) {
    const e = row(list, entry.title || entry.url, `${new Date(entry.time).toLocaleString()} · ${entry.url}`);
    button(e, '열기', () => send('entry-open', { kind, id:entry.id })); button(e, '삭제', () => send('entry-remove', { kind, id:entry.id }));
    if (bookmark) { const input = document.createElement('input'); input.value = entry.title; input.maxLength = 200; input.setAttribute('aria-label','북마크 이름'); e.append(input); button(e,'이름 저장',() => send('bookmark-rename',{id:entry.id,title:input.value})); }
  }
  if (!list.childElementCount) row(list, '항목이 없습니다.', '');
}
$('bookmark-filter').oninput = () => current && entries('bookmarks'); $('history-filter').oninput = () => current && entries('history');
$('settings-form').oninput = () => { settingsDirty = true; };
$('settings-form').onsubmit = e => { e.preventDefault(); settingsDirty = false; send('settings',{settings:{search:$('search').value,theme:$('theme').value,history:$('remember-history').checked,restoreTabs:$('restore-tabs').checked}}); };
window.manager.onSection(show);
window.manager.onState(state => {
  current = state;
  $('update-status').textContent=state.updates.message;$('update-check').disabled=!state.updates.configured||state.updates.busy;$('update-install').disabled=!state.updates.version||state.updates.busy;
  $('status').textContent = (state.storage === 'available' ? 'OS 암호화 저장 사용 중.' : state.storage === 'failed' ? '저장·복원에 실패했습니다. 변경은 메모리에만 남을 수 있습니다.' : '보호 저장소를 사용할 수 없어 기록과 설정은 이번 실행 동안만 유지됩니다.') + ' ' + state.message;
  if (!settingsDirty) { $('search').value=state.settings.search; $('theme').value=state.settings.theme; $('remember-history').checked=state.settings.history; $('restore-tabs').checked=state.settings.restoreTabs; }
  // Do not replace a bookmark title while the owner is editing it.
  if (!$('bookmark-list').contains(document.activeElement)) entries('bookmarks'); entries('history');
  $('download-list').replaceChildren();
  for (const item of state.downloads) { const protection=item.protection==='marked'?' · Windows 인터넷 출처 표시됨':item.protection==='unavailable'?' · Windows 출처 표시를 기록하지 못함':'';const e=row($('download-list'),item.name,`${item.origin} · ${item.state} · ${item.received} / ${item.total || '?'} bytes${protection}`); const live=['progressing','interrupted'].includes(item.state);
    for (const [action,label] of (live ? [[item.paused || item.state==='interrupted'?'resume':'pause',item.paused || item.state==='interrupted'?'계속':'일시정지'],['cancel','취소']] : item.state==='completed' ? [['show','폴더에서 보기'],['remove','목록에서 제거']] : [['remove','목록에서 제거']])) button(e,label,() => send('download',{id:item.id,action})); }
  $('permission-list').replaceChildren();
  for (const rule of state.permissions) { const e=row($('permission-list'),rule.origin,`${rule.permission}: ${rule.decision}`); for (const [decision,label] of [['ask','다시 묻기'],['deny','차단'],['allow','허용']]) button(e,label,() => send('permission',{origin:rule.origin,permission:rule.permission,decision})); }
  $('audit-list').replaceChildren(); for (const item of state.audit.slice(0,300)) row($('audit-list'),`${item.operation} · ${item.outcome}`,`${new Date(item.time).toLocaleString()} · ${item.origin}`);
});
send('ready');
