'use strict';
(() => {
  const el = id => document.getElementById(id), send = (type, extra = {}) => window.ai.command({ type, ...extra });
  const settings = window.initAiSettings(send); let state, transcript = '';
  const display = mode => send('task-display',{mode});
  el('controls-toggle').onclick=()=>display(state?.display?.mode==='controls'?'status':'controls');
  el('status-mode').onclick=()=>display('status');el('page-mode').onclick=()=>display('page');el('show-page').onclick=()=>display('page');
  el('task-return').onclick=()=>send('task-return');
  el('task-recover').onclick=()=>send('task-recover');
  el('quick-pause').onclick=()=>send('stop');el('quick-continue').onclick=()=>send('continue-task');el('quick-handoff').onclick=()=>send('handoff');el('quick-end').onclick=()=>send('task-close');
  el('cursor-motion').checked=!matchMedia('(prefers-reduced-motion: reduce)').matches;
  const visualOptions=()=>send('visual-options',{speed:Number(el('replay-speed').value),motion:el('cursor-motion').checked});
  el('replay-speed').onchange=visualOptions;el('cursor-motion').onchange=visualOptions;
  for (const type of ['clear', 'hide', 'task-close', 'remove-context', 'approve', 'reject', 'continue-task', 'handoff', 'save-chat', 'load-chat', 'delete-chat']) el(type).onclick = () => send(type);
  el('options-form').onsubmit = event => { event.preventDefault(); send('options', {options:{maxOutput:Number(el('max-output').value),reasoning:el('reasoning').value,contextLimit:Number(el('context-limit').value),inputPrice:Number(el('input-price').value),cachedPrice:Number(el('cached-price').value),outputPrice:Number(el('output-price').value),budget:Number(el('budget').value)}}); };
  el('ai-stop').onclick = () => send('stop');
  el('share-human').onclick = () => send('share', { source: 'human' }); el('share-task').onclick = () => send('share', { source: 'task' });
  el('share-control').onclick = () => send('share', {source:'controlled'});
  el('share-selection').onclick=()=>send('share-selection');
  el('workflow-form').onsubmit = event => {event.preventDefault();send(state?.draft?'draft-start':'run-task',{...(state?.draft?{id:state.draft.id}:{}),goal:el('goal').value,steps:Number(el('steps').value)});};
  el('draft-refresh').onclick=()=>send('draft-refresh',{goal:el('goal').value});el('draft-dismiss').onclick=()=>send('draft-dismiss');
  el('choose-model').onclick = () => send('model', { model: el('model').value.trim() });
  el('task-form').onsubmit = event => { event.preventDefault(); send('task-open', { url: el('task-url').value }); };
  document.ondragover=event=>{if(event.isTrusted)event.preventDefault();};
  document.ondrop=event=>{if(!event.isTrusted)return;event.preventDefault();const data=event.dataTransfer;if(!data||data.files.length){el('drag-message').textContent='파일·이미지 드래그는 아직 지원하지 않습니다. 웹사이트 파일 업로드는 해당 페이지의 파일 선택을 사용하세요.';return;}const text=(data.getData('text/uri-list')||data.getData('text/plain')).trim();if(!text||text.length>12000){el('drag-message').textContent='텍스트 또는 웹 링크를 12,000자 이내로 전달해 주세요.';return;}if(data.types.includes('text/uri-list')){try{const url=new URL(text.split(/\r?\n/).find(line=>!line.startsWith('#'))||'');if(!['http:','https:'].includes(url.protocol)||url.username||url.password)throw Error();}catch{el('drag-message').textContent='HTTP 또는 HTTPS 웹 링크만 지원합니다.';return;}}send('draft-create',{text,kind:data.types.includes('text/uri-list')?'link':'selection'});el('drag-message').textContent='Toast 작업 초안으로 만들었습니다. 공유할 페이지와 목표를 확인한 뒤 시작하세요.';};
  el('chat-form').onsubmit = event => { event.preventDefault(); if (!state || state.busy || !state.connected) return; const text = el('prompt').value.trim(); if (!text) return; el('prompt').value = ''; send('send', { text }); };
  window.ai.onState(next => {
    state = next; settings(state);
    const shown=state.display;
    if(shown){
      el('slot-number').textContent=String(shown.slot);el('controls-drawer').hidden=shown.mode!=='controls';el('task-status').hidden=shown.mode==='page'&&shown.hasTask;
      el('page-mode').disabled=!shown.hasTask;el('show-page').disabled=!shown.hasTask;el('task-return').disabled=!shown.hasTask;
      for(const mode of ['status','page'])el(mode+'-mode').setAttribute('aria-pressed',String(shown.mode===mode));
      const failed=['crashed','failed'].includes(shown.status);el('task-recover').hidden=!failed;el('show-page').disabled=!shown.hasTask||shown.status==='crashed';el('page-mode').disabled=!shown.hasTask||shown.status==='crashed';
      el('task-heading').textContent=failed?'작업 페이지를 다시 열어주세요':shown.status==='loading'?'작업 페이지를 불러오는 중입니다':state.proposal?'동작 승인을 기다립니다':state.busy?(state.connected?'AI 에이전트가 작업을 수행 중입니다':'연결·작업을 준비하는 중입니다'):state.workflow?.status==='paused'?'작업을 일시정지했습니다':state.workflow?.status==='completed'?'작업 결과를 확인하세요':shown.hasTask?'AI 작업 페이지가 준비됐습니다':'AI 작업을 준비하세요';
      el('task-site').textContent=shown.url||'탭을 보내거나 설정에서 작업 주소를 입력하세요.';
      el('quick-continue').disabled=state.busy||state.workflow?.status!=='paused';el('quick-end').disabled=!shown.hasTask;el('quick-handoff').disabled=!shown.hasTask;
      el('event-log').replaceChildren(...shown.events.slice().reverse().map(e=>{const li=document.createElement('li');li.textContent=`${new Date(e.time).toLocaleTimeString()} · ${e.operation} · ${e.name} · ${e.outcome}`;if(e.point&&e.outcome==='executed'){const replay=document.createElement('button');replay.textContent='기록 재생';replay.onclick=()=>{display('page');send('replay',{id:e.id});};li.append(replay);}return li;}));
    }
    el('save-chat').disabled=state.busy||!state.storageAvailable;el('load-chat').disabled=state.busy||!state.storageAvailable;el('delete-chat').disabled=state.busy;
    el('cost').textContent = `${state.options.inputPrice > 0 || state.options.outputPrice > 0 ? '추정 누적 $'+state.estimatedCost.toFixed(6) : '단가 미설정'} · 컨텍스트 잔여 ${state.contextRemaining === null ? '모름' : state.contextRemaining+' 토큰 (입력 한도 기준)'}`;
    const metrics=state.metrics;if(metrics)el('ir-metrics').textContent=`ToastIR 수집 ${metrics.captureMs.toFixed(1)}ms · 이번 페이지 ${metrics.contextBytes.toLocaleString()}B (${metrics.frame==='delta'?'변경분':'전체'}) · 모델 응답 ${(metrics.modelMs/1000).toFixed(2)}초 · 동작 ${metrics.actions}회 / 확인 실패 ${metrics.failures}회`;
    el('workflow-status').textContent=state.workflow ? `${state.workflow.status} · ${state.workflow.step}/${state.workflow.limit} 단계 · ${state.workflow.origin}` : '작업 없음';
    el('continue-task').disabled=state.busy || state.workflow?.status!=='paused';
    el('run-task').disabled=state.busy || !state.connected || !!state.draft?.stale;el('draft-info').hidden=!state.draft;el('draft-reference').hidden=!state.draft?.reference;el('draft-reference').textContent=state.draft?.reference||'';el('draft-origin').textContent=state.draft?`${state.draft.stale?'페이지가 바뀌었습니다. 다시 첨부해 주세요.':'공유 대기'} · ${state.draft.kind==='link'?state.draft.url:state.draft.origin||'현재 HTTPS 페이지가 필요합니다.'}`:'';el('run-task').textContent=state.draft?'초안 확인 · 공유 승인 후 시작':'공유 승인 후 시작';
    el('share-control').disabled=state.busy;
    el('send').disabled = state.busy || !state.connected || !state.model;
    for (const id of ['share-human', 'share-task', 'task-open', 'approve']) el(id).disabled = state.busy;
    el('context').hidden = !state.context;
    el('context-origin').textContent = state.context ? `${state.context.source === 'human' ? '현재 탭 읽기' : state.context.source === 'controlled' ? '현재 탭 제어 공유' : 'AI 작업'} · ${state.context.origin}` : '';
    el('context-preview').textContent = state.context ? `${state.context.truncated?'[수집 한도에 따라 페이지 일부만 포함됩니다]\n':''}${state.context.text}\n\n${state.context.elements.map(e => `[${e.id}] ${e.name}`).join('\n')}` : '';
    el('proposal').hidden = !state.proposal;
    el('proposal-description').textContent = state.proposal ? `${state.proposal.origin}\n${state.proposal.action?.op || "CLICK"} 제안: ${state.proposal.name}\n${state.proposal.action?.value || ""}` : '';
    el('ai-message').textContent = state.message;
    el('usage').textContent = `응답에 보고된 사용량 · 입력 ${state.usage.input.toLocaleString()} / 출력 ${state.usage.output.toLocaleString()} / 입력 중 캐시 ${state.usage.cached.toLocaleString()} 토큰 · 요청 ${state.requests}회`;
    const serialized = JSON.stringify(state.messages);
    if (serialized !== transcript) {
      transcript = serialized; el('messages').replaceChildren(...state.messages.map(m => {
        const item = document.createElement('div'); item.className = 'message'; const role = document.createElement('strong'); role.textContent = m.role === 'user' ? '나' : 'AI'; const content = document.createElement('p'); content.textContent = m.content; item.append(role, content); return item;
      })); el('messages').lastElementChild?.scrollIntoView({ block: 'nearest' });
    }
  });
  send('ready');
  visualOptions();
})();

let lastDraftId=0;window.ai.onState(state=>{if(state.draft?.id&&state.draft.id!==lastDraftId){lastDraftId=state.draft.id;const goal=document.getElementById("goal");if(goal){goal.value=state.draft.text;goal.closest("details").open=true;goal.focus();}document.getElementById("ai-message").textContent="작업 초안입니다. 내용을 확인한 뒤 시작하세요.";}});

(()=>{let signature='',selected='';const labels={created:'초안',running:'실행 중','awaiting-approval':'승인 대기',completed:'모델이 완료 보고',failed:'실패',interrupted:'중단됨',cancelled:'취소됨'},reasons={none:'', 'approval-denied':'공유 승인을 받지 못했습니다.','page-changed':'페이지 또는 제어 범위가 바뀌었습니다.',network:'연결 실패 또는 시간 초과',auth:'API 인증 실패',limit:'요청·사용량 한도',model:'모델 설정 확인 필요',response:'모델 응답 형식 오류','execution-unconfirmed':'동작 결과를 확인하지 못했습니다.',stopped:'사용자가 작업을 중단했습니다.','step-limit':'최대 단계에 도달했습니다.','model-no-action':'다음 동작 또는 완료 근거가 없습니다.',restored:'앱이 종료되어 중단됐습니다. 자동으로 재실행하지 않습니다.'};window.ai.onState(s=>{const history=s.taskHistory;if(!history)return;const key=JSON.stringify([history,s.busy]);if(key===signature)return;signature=key;const list=document.getElementById('task-history-list');list.replaceChildren();document.getElementById('task-history-storage').textContent=history.status==='available'?'이 기기에 보호 저장 중':history.status==='failed'?'기록 저장·복원 실패. 이번 실행의 기록만 표시합니다.':'기기 보호 저장소를 사용할 수 없어 종료 후 기록을 유지할 수 없습니다.';for(const record of history.records){const li=document.createElement('li'),button=document.createElement('button');button.textContent=`${new Date(record.created).toLocaleString()} · ${labels[record.status]} · ${record.origin||'작업 초안'}`;button.onclick=()=>window.ai.command({type:'history-select',id:record.id});li.append(button);list.append(li);}const detail=document.getElementById('task-history-detail');detail.replaceChildren();const record=history.records.find(r=>r.id===history.selected);if(record){if(selected!==record.id){selected=record.id;document.getElementById('task-history').open=true;}const title=document.createElement('p');title.textContent=`${labels[record.status]} · ${record.step}단계 · ${reasons[record.reason]||''}`;detail.append(title);const steps=document.createElement('ol');for(const step of record.steps){const li=document.createElement('li');li.textContent=`${step.step}. ${step.operation} — ${{observed:'페이지에서 확인',dispatched:'DOM에 전달 (서버 처리 성공은 별도 확인)',unconfirmed:'결과 미확인'}[step.outcome]}`;steps.append(li);}const retry=document.createElement('button');retry.textContent='현재 페이지에서 새 초안으로 재시도';retry.disabled=s.busy||['running','awaiting-approval'].includes(record.status);retry.onclick=()=>window.ai.command({type:'history-retry',id:record.id});detail.append(steps,retry);}});})();
