/** Read-only eligibility probe. Any interaction, editor, media or embedded frame makes a page ineligible. */
export function installIdleProbe():void {
  const world=globalThis as typeof globalThis&{__toastIdle?:()=>boolean};if(Object.hasOwn(world,'__toastIdle'))return;
  let interacted=false;
  for(const type of ['input','change','keydown','pointerdown','drop'])document.addEventListener(type,event=>{if(event.isTrusted)interacted=true;},{capture:true,passive:true});
  const safe=()=>{
    if(interacted||document.designMode==='on'||document.querySelector('input,textarea,select,[contenteditable],video,audio,iframe,canvas,object,embed'))return false;
    // Custom elements may keep editors in inaccessible closed shadow roots.
    // Conservatively retain them, and never scan an unbounded page for eligibility.
    const walker=document.createTreeWalker(document,NodeFilter.SHOW_ELEMENT);let node,count=0;
    while((node=walker.nextNode())){if(++count>10000)return false;const element=node as Element;if(element.shadowRoot||element.localName.includes('-'))return false;}
    return true;
  };
  Object.defineProperty(world,'__toastIdle',{value:safe,writable:false,configurable:false});
}
