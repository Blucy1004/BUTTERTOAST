/** Fixed application-owned code executed only in an isolated Chromium world.
 * Never interpolate model-supplied code or install a bridge into the page world.
 */
export function installToastRuntime(documentId: string): void {
  type Entry = { node: HTMLElement; fingerprint: string };
  const world = globalThis as typeof globalThis & { __toastIR?: unknown };
  if (Object.hasOwn(world, '__toastIR')) return;
  let version = 0, nextId = 1, previous = '';
  const ids = new WeakMap<Element, string>();
  let entries = new Map<string, Entry>();
  const roots = new WeakSet<Node>();let rootCount=0,shadowSkipped=false;
  let stats={visited:0,elements:0,textCharacters:0,shadowRoots:0,framesSkipped:0,truncated:false,captureMs:0};
  const privateSelector = 'input,textarea,select,[contenteditable]:not([contenteditable="false"]),[data-private]';
  const excluded='script,style,noscript,template,input,textarea,select,[contenteditable]:not([contenteditable="false"]),[data-private],[hidden],[aria-hidden="true"],[inert]';
  let privateParents=new WeakSet<Element>();
  const observer = new MutationObserver(records => { if (records.length) version++; });
  observer.observe(document, { subtree: true, attributes: true, childList: true, characterData: true });
  const flush = () => { if (observer.takeRecords().length) version++; };
  function parentOf(node:Element):Element|null {
    const root=node.getRootNode();
    return node.assignedSlot||node.parentElement||(root instanceof ShadowRoot?root.host:null);
  }
  function within(node:Element,selector:string):boolean {
    let current:Element|null=node,depth=0;
    while(current&&depth++<128){if(current.matches(selector))return true;current=parentOf(current);}
    return !!current; // Excessive depth is opaque, never an escape from a private ancestor.
  }
  function* walk(root:Node,limit=10000):Generator<Node> {
    const stack:Node[]=[];let node:Node|null=root,visited=0;
    while(node&&visited++<limit){
      yield node;
      if(node!==root&&node.nextSibling)stack.push(node.nextSibling);
      const shadow:ShadowRoot|null=node instanceof Element?node.shadowRoot:null;
      if(shadow&&(roots.has(shadow)||rootCount<128)){
        if(!roots.has(shadow)){roots.add(shadow);rootCount++;observer.observe(shadow,{subtree:true,attributes:true,childList:true,characterData:true});}
        if(node.firstChild)stack.push(node.firstChild);
        node=shadow.firstChild||stack.pop()||null;
      }else {if(shadow)shadowSkipped=true;node=node.firstChild||stack.pop()||null;}
    }
  }
  function readable(node:Element):boolean {return !within(node,excluded)&&node.checkVisibility({opacityProperty:true,visibilityProperty:true,contentVisibilityAuto:true});}
  function visibleText(root:Node,limit=12000):string {
    const parts:string[]=[];let length=0;
    for(const node of walk(root)){
      if(node.nodeType!==Node.TEXT_NODE)continue;
      const tree=node.getRootNode(),parent=node.parentElement||(tree instanceof ShadowRoot?tree.host:null);if(!parent||!readable(parent))continue;
      const text=(node.textContent||'').replace(/\s+/g,' ').trim().slice(0,limit-length);
      if(text){parts.push(text);length+=text.length+1;}if(length>=limit)break;
    }
    return parts.join('\n').slice(0,limit);
  }
  function describe(node: HTMLElement) {
    const style = getComputedStyle(node), rect = node.getBoundingClientRect();
    const field = node instanceof HTMLInputElement || node instanceof HTMLTextAreaElement || node instanceof HTMLSelectElement;
    const secretField = node instanceof HTMLInputElement && (['password','hidden','file'].includes(node.type)
      || /password|secret|token|credit|card|cc-|cvc|cvv|otp|one-time|ssn/i.test(`${node.name} ${node.id} ${node.autocomplete}`));
    const sensitive = !!(secretField || within(node,'[data-private],[contenteditable]:not([contenteditable="false"])') || (!field && privateParents.has(node)));
    const visible = node.checkVisibility({ opacityProperty: true, visibilityProperty: true, contentVisibilityAuto: true }) && node.isConnected && rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility === 'visible'
      && !within(node,'[hidden],[aria-hidden="true"],[inert]') && Number(style.opacity) !== 0;
    const enabled = !node.matches(':disabled,[aria-disabled="true"]') && style.pointerEvents !== 'none';
    const form = field?(node as HTMLInputElement).form:node.closest('form');
    const root=node.getRootNode() as Document|ShadowRoot;
    const labelled=(node.getAttribute('aria-labelledby')||'').split(/\s+/).slice(0,10).map(id=>root.getElementById(id));
    if(field)labelled.push(...Array.from((node as HTMLInputElement).labels||[]).slice(0,10));
    const accessibleLabel=labelled.filter((e):e is HTMLElement=>e instanceof HTMLElement&&readable(e)&&!privateParents.has(e)).map(e=>visibleText(e,160)).join(' ').slice(0,160);
    const choices=node instanceof HTMLSelectElement?Array.from(node.options).filter(o=>!o.disabled&&!o.hidden&&!o.parentElement?.matches('optgroup:disabled')).slice(0,40).map(o=>o.label.slice(0,80)).join(' / '):'';
    const name = sensitive || !visible ? '[private]' : (node.getAttribute('aria-label') || accessibleLabel || (field ? node.getAttribute('placeholder') || '입력 필드' : visibleText(node,160)) || '').trim().slice(0, choices?80:160)+(choices?` [${choices}]`.slice(0,80):'');
    const toggle=node instanceof HTMLInputElement&&['checkbox','radio'].includes(node.type);
    const clickable=node.matches('a[href],button,[role="button"],[role="link"],[role="checkbox"],[role="switch"],[role="menuitem"]')||(node instanceof HTMLInputElement&&['checkbox','radio','button','submit','reset'].includes(node.type));
    const role = (node.tagName === 'A' ? 'link' : node.tagName === 'BUTTON' ? 'button' : node.tagName === 'SELECT' ? 'combobox' : toggle ? (node as HTMLInputElement).type : node.getAttribute('role') || (field?'textbox':node.tagName.toLowerCase())).slice(0,100);
    // Fingerprint both visible description and destinations/containing form semantics.
    const fingerprint = JSON.stringify([node.tagName, name, node.getAttribute('href'), node.getAttribute('type'), node.getAttribute('formaction'), node.getAttribute('form'),
      form?.getAttribute('action'), form?.getAttribute('method'), field ? (node as HTMLInputElement).value : '',node instanceof HTMLInputElement?node.checked:false, node.getAttribute('autocomplete'), choices, visible, enabled, sensitive]);
    const actions = sensitive ? [] : node instanceof HTMLSelectElement ? ['SELECT'] : clickable ? ['READ','EXTRACT','VERIFY','CLICK'] : field ? ['FILL'] : ['READ', 'EXTRACT', 'VERIFY'];
    return { role, name, visible, enabled, sensitive, fingerprint, actions };
  }
  function readVisibleText(): string {
    return visibleText(document.body||document.documentElement);
  }
  function capture(includeText = false) {
    const started=performance.now();flush();
    const interactive:HTMLElement[]=[],content:HTMLElement[]=[];let visited=0,frames=0,eligible=0;shadowSkipped=false;
    privateParents=new WeakSet();
    for(const node of walk(document.body||document.documentElement)){
      visited++;if(!(node instanceof HTMLElement))continue;
      if(node.tagName==='IFRAME')frames++;
      if(node.matches(privateSelector)){let parent=parentOf(node),depth=0;while(parent&&depth++<128){privateParents.add(parent);parent=parentOf(parent);}}
      if(node.matches('button,a[href],input,textarea,select,[role="button"],[role="link"],[role="checkbox"],[role="switch"],[role="menuitem"]')){eligible++;if(interactive.length<500)interactive.push(node);}
      else if(node.matches('h1,h2,h3,h4,h5,h6,p,li,article,section,main,nav,[role="region"]')){eligible++;if(content.length<500)content.push(node);}
    }
    const nodes=[...interactive,...content].slice(0,500);
    const selected = new Set<Element>(nodes);
    for (const node of nodes) if (!ids.has(node)) ids.set(node, `e${nextId++}`);
    const fresh = new Map<string, Entry>();
    const elements = nodes.map(node => {
      let id = ids.get(node); if (!id) { id = `e${nextId++}`; ids.set(node, id); }
      const data = describe(node); fresh.set(id, { node, fingerprint: data.fingerprint });
      const { fingerprint, ...publicData } = data;
      let parent = parentOf(node),depth=0;
      while (parent && !selected.has(parent)&&depth++<128) parent = parentOf(parent);
      if(depth>=128)parent=null;
      return { id, parent: parent ? ids.get(parent)! : null, ...publicData };
    });
    const signature = JSON.stringify([elements, [...fresh.values()].map(e => e.fingerprint)]);
    if (signature !== previous) { version++; previous = signature; }
    entries = fresh;
    const text=includeText?readVisibleText():'';
    stats={visited,elements:elements.length,textCharacters:text.length,shadowRoots:rootCount,framesSkipped:frames,truncated:visited>=10000||eligible>500||shadowSkipped||text.length>=12000,captureMs:performance.now()-started};
    return { document: documentId, version, origin: location.origin, elements, text };
  }
  function perform(action: { document: string; version: number; target: string; op: string; value: string }) {
    flush();
    if (action.document !== documentId || action.version !== version) return { ok: false, reason: 'stale-document-or-version' };
    if (action.op === 'SCROLL' && /^-?(?:[1-9]\d{0,2}|1000)$/.test(action.value)) { window.scrollBy({ top: Number(action.value), behavior: 'instant' }); return { ok: true }; }
    if (action.op === 'NAVIGATE') {
      try { const url = new URL(action.value); if (url.protocol !== 'https:' || url.origin !== location.origin || url.username || url.password) return { ok:false, reason:'navigation-scope' }; location.assign(url.href); return {ok:true}; } catch { return {ok:false,reason:'navigation-scope'}; }
    }
    const entry = entries.get(action.target);
    if (!entry || !entry.node.isConnected) return { ok: false, reason: 'detached' };
    const data = describe(entry.node);
    if (data.fingerprint !== entry.fingerprint || !data.visible || !data.enabled || data.sensitive) return { ok: false, reason: 'changed-target' };
    const targetRect = entry.node.getBoundingClientRect();
    const point = { x: targetRect.x + targetRect.width / 2, y: targetRect.y + targetRect.height / 2, width: innerWidth, height: innerHeight };
    if (['READ', 'EXTRACT', 'VERIFY'].includes(action.op)) {
      return { ok: true, text: action.op==='EXTRACT'?visibleText(entry.node,4096):data.name, ...(action.op === 'VERIFY' ? { matches: data.name === action.value } : {}) };
    }
    if (!data.actions.includes(action.op)) return { ok: false, reason: 'unsupported' };
    if (action.op === 'FILL') {
      if (!(entry.node instanceof HTMLInputElement || entry.node instanceof HTMLTextAreaElement) || entry.node.readOnly || (entry.node instanceof HTMLInputElement && !['text','search','url','email','tel','number'].includes(entry.node.type))) return {ok:false,reason:'field-type'};
      if (entry.node.maxLength >= 0 && action.value.length > entry.node.maxLength) return {ok:false,reason:'field-length'};
      entry.node.value = action.value;
      // One event: a page may replace the target in its handler. Do not dispatch another event to a stale node.
      entry.node.dispatchEvent(new InputEvent('input', {bubbles:true,composed:true,inputType:'insertText',data:action.value})); return {ok:true, point};
    }
    if (action.op === 'SELECT') {
      if (!(entry.node instanceof HTMLSelectElement) || entry.node.multiple) return {ok:false,reason:'option'};
      const matches=Array.from(entry.node.options).filter(o=>(o.value===action.value||o.label===action.value)&&!o.disabled&&!o.hidden&&!o.parentElement?.matches('optgroup:disabled'));
      if(matches.length!==1)return {ok:false,reason:'ambiguous-option'};
      entry.node.value=matches[0].value; entry.node.dispatchEvent(new Event('change',{bubbles:true})); return {ok:true, point};
    }
    if (action.op !== 'CLICK') return { ok:false, reason:'unsupported' };
    const rect = entry.node.getBoundingClientRect();
    let hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2),depth=0;
    while(hit?.shadowRoot&&depth++<128){const nested=hit.shadowRoot.elementFromPoint(rect.x+rect.width/2,rect.y+rect.height/2);if(!nested||nested===hit)break;hit=nested;}
    let ancestor:Element|null=hit;depth=0;
    while(ancestor&&ancestor!==entry.node&&depth++<128)ancestor=parentOf(ancestor);
    if (!hit || ancestor!==entry.node) return { ok: false, reason: 'covered' };
    // Validation and dispatch share one synchronous JS turn. Page handler effects are untrusted.
    entry.node.click();
    return { ok: true, point };
  }
  function selection():string {
    const selected=getSelection(),node=selected?.anchorNode;
    const textNode=node?.nodeType===Node.TEXT_NODE?node:node?.childNodes.length===1&&node.firstChild?.nodeType===Node.TEXT_NODE?node.firstChild:null;
    const parent=textNode?.parentElement;
    // A single visible text node only. Form selections and ranges crossing private
    // content must not be copied merely because the user selected nearby text.
    if(!selected||!node||node!==selected.focusNode||!textNode||!parent
      || document.activeElement?.matches('input,textarea,[contenteditable]:not([contenteditable="false"])')
      ||within(parent,excluded)
      ||!parent.checkVisibility({opacityProperty:true,visibilityProperty:true}))return '';
    const text=textNode.textContent||'',factor=node===textNode?1:text.length;
    return text.slice(Math.min(selected.anchorOffset,selected.focusOffset)*factor,Math.max(selected.anchorOffset,selected.focusOffset)*factor).slice(0,4000);
  }
  Object.defineProperty(world, '__toastIR', { value: Object.freeze({ capture, perform, selection, statistics:()=>({...stats}) }), configurable: false, writable: false });
}
