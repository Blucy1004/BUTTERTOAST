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
  const observer = new MutationObserver(records => { if (records.length) version++; });
  observer.observe(document, { subtree: true, attributes: true, childList: true, characterData: true });
  const flush = () => { if (observer.takeRecords().length) version++; };
  function describe(node: HTMLElement) {
    const style = getComputedStyle(node), rect = node.getBoundingClientRect();
    const privateSelector = 'input,textarea,select,[contenteditable]:not([contenteditable="false"]),[data-private]';
    const field = node instanceof HTMLInputElement || node instanceof HTMLTextAreaElement || node instanceof HTMLSelectElement;
    const secretField = node instanceof HTMLInputElement && (['password','hidden','file'].includes(node.type)
      || /password|secret|token|credit|card|cc-|cvc|cvv|otp|one-time|ssn/i.test(`${node.name} ${node.id} ${node.autocomplete}`));
    const sensitive = !!(secretField || node.closest('[data-private],[contenteditable]:not([contenteditable="false"])') || (!field && node.querySelector(privateSelector)));
    const visible = node.checkVisibility({ opacityProperty: true, visibilityProperty: true, contentVisibilityAuto: true }) && node.isConnected && rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility === 'visible'
      && !node.closest('[hidden],[aria-hidden="true"],[inert]') && Number(style.opacity) !== 0;
    const enabled = !node.matches(':disabled,[aria-disabled="true"]') && style.pointerEvents !== 'none';
    const form = node.closest('form');
    const accessibleLabel=(node.getAttribute('aria-labelledby')||'').split(/\s+/).slice(0,10).map(id=>document.getElementById(id)).filter((e):e is HTMLElement=>!!e&&!e.closest('[data-private],[hidden],[aria-hidden="true"],input,textarea,select')&&!e.querySelector(privateSelector)&&e.checkVisibility({opacityProperty:true,visibilityProperty:true})).map(e=>e.innerText).join(' ').slice(0,160);
    const choices=node instanceof HTMLSelectElement?Array.from(node.options).filter(o=>!o.disabled&&!o.hidden).slice(0,40).map(o=>o.label.slice(0,80)).join(' / '):'';
    const name = sensitive || !visible ? '[private]' : (node.getAttribute('aria-label') || accessibleLabel || (field ? node.getAttribute('placeholder') || '입력 필드' : node.innerText) || '').trim().slice(0, choices?80:160)+(choices?` [${choices}]`.slice(0,80):'');
    const role = (node.tagName === 'A' ? 'link' : node.tagName === 'BUTTON' ? 'button' : node.tagName === 'SELECT' ? 'combobox' : field ? 'textbox' : node.getAttribute('role') || node.tagName.toLowerCase()).slice(0,100);
    // Fingerprint both visible description and destinations/containing form semantics.
    const fingerprint = JSON.stringify([node.tagName, name, node.getAttribute('href'), node.getAttribute('type'), node.getAttribute('formaction'), node.getAttribute('form'),
      form?.getAttribute('action'), form?.getAttribute('method'), field ? (node as HTMLInputElement).value : '', node.getAttribute('autocomplete'), choices, visible, enabled, sensitive]);
    const actions = sensitive ? [] : node instanceof HTMLSelectElement ? ['SELECT'] : field ? ['FILL'] : ['READ', 'EXTRACT', 'VERIFY', ...(node.matches('a[href],button,[role="button"]') ? ['CLICK'] : [])];
    return { role, name, visible, enabled, sensitive, fingerprint, actions };
  }
  function readVisibleText(): string {
    const walker = document.createTreeWalker(document.body || document.documentElement, NodeFilter.SHOW_TEXT);
    const excluded = 'script,style,noscript,template,input,textarea,select,[contenteditable]:not([contenteditable="false"]),[data-private],[hidden],[aria-hidden="true"],[inert]';
    const parts: string[] = []; let length = 0, visited = 0;
    while (walker.nextNode() && visited++ < 10000 && length < 12000) {
      const parent = walker.currentNode.parentElement;
      if (!parent || parent.closest(excluded) || !parent.checkVisibility({ opacityProperty: true, visibilityProperty: true, contentVisibilityAuto: true })) continue;
      const text = (walker.currentNode.textContent || '').replace(/\s+/g, ' ').trim();
      if (text) { const bounded = text.slice(0, 12000 - length); parts.push(bounded); length += bounded.length + 1; }
    }
    return parts.join('\n').slice(0, 12000);
  }
  function capture(includeText = false) {
    flush();
    const nodes = Array.from(document.querySelectorAll<HTMLElement>('button,a[href],input,textarea,select,h1,h2,h3,main,nav,[role="button"],[role="region"]')).slice(0, 500);
    const selected = new Set<Element>(nodes);
    for (const node of nodes) if (!ids.has(node)) ids.set(node, `e${nextId++}`);
    const fresh = new Map<string, Entry>();
    const elements = nodes.map(node => {
      let id = ids.get(node); if (!id) { id = `e${nextId++}`; ids.set(node, id); }
      const data = describe(node); fresh.set(id, { node, fingerprint: data.fingerprint });
      const { fingerprint, ...publicData } = data;
      let parent = node.parentElement;
      while (parent && !selected.has(parent)) parent = parent.parentElement;
      return { id, parent: parent ? ids.get(parent)! : null, ...publicData };
    });
    const signature = JSON.stringify([elements, [...fresh.values()].map(e => e.fingerprint)]);
    if (signature !== previous) { version++; previous = signature; }
    entries = fresh;
    return { document: documentId, version, origin: location.origin, elements, text: includeText ? readVisibleText() : '' };
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
    if (['READ', 'EXTRACT', 'VERIFY'].includes(action.op)) {
      return { ok: true, text: data.name, ...(action.op === 'VERIFY' ? { matches: data.name === action.value } : {}) };
    }
    if (!data.actions.includes(action.op)) return { ok: false, reason: 'unsupported' };
    if (action.op === 'FILL') {
      if (!(entry.node instanceof HTMLInputElement || entry.node instanceof HTMLTextAreaElement) || entry.node.readOnly || (entry.node instanceof HTMLInputElement && !['text','search','url','email','tel','number'].includes(entry.node.type))) return {ok:false,reason:'field-type'};
      if (entry.node.maxLength >= 0 && action.value.length > entry.node.maxLength) return {ok:false,reason:'field-length'};
      entry.node.value = action.value;
      // One event: a page may replace the target in its handler. Do not dispatch another event to a stale node.
      entry.node.dispatchEvent(new Event('input', {bubbles:true})); return {ok:true};
    }
    if (action.op === 'SELECT') {
      if (!(entry.node instanceof HTMLSelectElement) || entry.node.multiple) return {ok:false,reason:'option'};
      const matches=Array.from(entry.node.options).filter(o=>(o.value===action.value||o.label===action.value)&&!o.disabled&&!o.hidden);
      if(matches.length!==1)return {ok:false,reason:'ambiguous-option'};
      entry.node.value=matches[0].value; entry.node.dispatchEvent(new Event('change',{bubbles:true})); return {ok:true};
    }
    if (action.op !== 'CLICK') return { ok:false, reason:'unsupported' };
    const rect = entry.node.getBoundingClientRect();
    const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
    if (!hit || !(hit === entry.node || entry.node.contains(hit))) return { ok: false, reason: 'covered' };
    // Validation and dispatch share one synchronous JS turn. Page handler effects are untrusted.
    entry.node.click();
    return { ok: true };
  }
  Object.defineProperty(world, '__toastIR', { value: Object.freeze({ capture, perform }), configurable: false, writable: false });
}
