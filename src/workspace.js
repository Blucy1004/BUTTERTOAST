'use strict';
window.initWorkspace = send => {
  let state, draggedId = null, resizing = null, last = 0;
  const $ = id => document.getElementById(id);
  const place = (el, b) => { for (const k of ['x','y','width','height']) el.style[({x:'left',y:'top'})[k] || k] = b[k]+'px'; };
  const endResize = () => { if (resizing) { resizing = null; send('workspace-resize-end'); } };
  for (const side of ['left','right']) {
    const handle = $(side+'-splitter');
    handle.onpointerdown = e => { if (e.button!==0) return; resizing={side,id:e.pointerId};handle.setPointerCapture(e.pointerId);e.preventDefault(); };
    handle.onpointermove = e => {
      if (!resizing || resizing.side!==side || Date.now()-last<35) return; last=Date.now();
      const width = side==='left'?e.clientX-16:innerWidth-e.clientX-16;
      send('workspace-resize',{side,width:Math.round(Math.max(side==='left'?160:300,Math.min(side==='left'?420:720,width)))});
    };
    handle.onpointerup = endResize; handle.onpointercancel = endResize;handle.onlostpointercapture=endResize;
    handle.onkeydown = e => { if(!['ArrowLeft','ArrowRight'].includes(e.key)||!state)return;e.preventDefault();const d=(e.key==='ArrowRight'?20:-20)*(side==='left'?1:-1);send('workspace-resize',{side,width:Math.min(side==='left'?420:720,Math.max(side==='left'?160:300,state.workspace[side]+d))});send('workspace-resize-end'); };
  }
  let gesture=null, suppressClick=false;
  const endDrag = () => { if(draggedId!==null){draggedId=null;$('drag-target').hidden=true;send('workspace-drag',{active:false});}gesture=null; };
  document.addEventListener('pointerdown',e=>{
    const tab=e.target.closest?.('.tab');if(!tab||e.button!==0||!e.isTrusted||e.target.closest('button')!==tab.querySelector('button'))return;
    gesture={id:Number(tab.dataset.tabId),x:e.clientX,y:e.clientY,element:tab.querySelector('button'),pointer:e.pointerId,kind:null};
    gesture.element.setPointerCapture(e.pointerId);
  });
  document.addEventListener('pointermove',e=>{
    if(!gesture||e.pointerId!==gesture.pointer)return;
    if(draggedId===null&&Math.hypot(e.clientX-gesture.x,e.clientY-gesture.y)>10){draggedId=gesture.id;gesture.kind=Math.abs(e.clientX-gesture.x)>Math.abs(e.clientY-gesture.y)?'delegate':'reorder';if(gesture.kind==='delegate'){$('drag-target').hidden=false;send('workspace-drag',{active:true});}}
    if(draggedId!==null)e.preventDefault();
  });
  document.addEventListener('pointerup',e=>{
    if(!gesture||e.pointerId!==gesture.pointer)return;
    const id=draggedId,rect=$('drag-target').getBoundingClientRect(),inside=e.clientX>=rect.left&&e.clientX<=rect.right&&e.clientY>=rect.top&&e.clientY<=rect.bottom;
    const kind=gesture.kind,target=document.elementFromPoint(e.clientX,e.clientY)?.closest('.tab');
    if(id!==null){suppressClick=true;setTimeout(()=>{suppressClick=false;},0);e.preventDefault();}endDrag();
    if(id!==null&&kind==='delegate'&&inside)send('delegate',{id});
    if(id!==null&&kind==='reorder'&&target)send('reorder',{id,before:Number(target.dataset.tabId)});
  });
  document.addEventListener('click',e=>{if(suppressClick){e.stopImmediatePropagation();e.preventDefault();suppressClick=false;}},true);
  document.addEventListener('pointercancel',endDrag);
  window.addEventListener('blur',()=>{endResize();endDrag();});
  return next => {
    state=next;const g=state.layout;if(!g)return;
    place($('butter-panel'),g.butter);place($('browser-panel'),g.browser);place($('toast-placeholder'),g.toast);
    $('butter-panel').classList.toggle('compact',g.compact);
    $('browser-panel').hidden=!g.browserVisible;$('toast-placeholder').hidden=!g.toastVisible;
    $('left-splitter').style.left=(g.butter.x+g.butter.width)+'px';$('left-splitter').hidden=g.compact;
    $('right-splitter').style.left=(g.toast.x-12)+'px';$('right-splitter').hidden=!g.toastVisible||g.narrow;
    for(const side of ['left','right'])$(side+'-splitter').setAttribute('aria-valuenow',String(state.workspace[side]));
    $('butter-toggle').setAttribute('aria-expanded',String(!g.compact));$('ai-toggle').setAttribute('aria-expanded',String(g.toastVisible));
  };
};
