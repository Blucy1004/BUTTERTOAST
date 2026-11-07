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
    const sensitive = !!(node.closest(privateSelector) || node.querySelector(privateSelector));
    const visible = node.checkVisibility({ opacityProperty: true, visibilityProperty: true, contentVisibilityAuto: true }) && node.isConnected && rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility === 'visible'
      && !node.closest('[hidden],[aria-hidden="true"],[inert]') && Number(style.opacity) !== 0;
    const enabled = !node.matches(':disabled,[aria-disabled="true"]') && style.pointerEvents !== 'none';
    const form = node.closest('form');
    const name = sensitive || !visible ? '[private]' : (node.getAttribute('aria-label') || node.innerText || '').trim().slice(0, 160);
    const role = node.tagName === 'A' ? 'link' : node.tagName === 'BUTTON' ? 'button' : 'form-control';
    // Fingerprint both visible description and destinations/containing form semantics.
    const fingerprint = JSON.stringify([node.tagName, name, node.getAttribute('href'), node.getAttribute('type'), node.getAttribute('formaction'), node.getAttribute('form'),
      form?.getAttribute('action'), form?.getAttribute('method'), visible, enabled, sensitive]);
    return { role, name, visible, enabled, sensitive, fingerprint, actions: sensitive ? [] : ['READ', 'EXTRACT', 'VERIFY', 'CLICK'] };
  }
  function capture() {
    flush();
    const nodes = Array.from(document.querySelectorAll<HTMLElement>('button,a[href],input,textarea,select')).slice(0, 500);
    const fresh = new Map<string, Entry>();
    const elements = nodes.map(node => {
      let id = ids.get(node); if (!id) { id = `e${nextId++}`; ids.set(node, id); }
      const data = describe(node); fresh.set(id, { node, fingerprint: data.fingerprint });
      const { fingerprint, ...publicData } = data;
      return { id, ...publicData };
    });
    const signature = JSON.stringify(elements);
    if (signature !== previous) { version++; previous = signature; }
    entries = fresh;
    return { document: documentId, version, origin: location.origin, elements };
  }
  function perform(action: { document: string; version: number; target: string; op: string; value: string }) {
    flush();
    if (action.document !== documentId || action.version !== version) return { ok: false, reason: 'stale-document-or-version' };
    const entry = entries.get(action.target);
    if (!entry || !entry.node.isConnected) return { ok: false, reason: 'detached' };
    const data = describe(entry.node);
    if (data.fingerprint !== entry.fingerprint || !data.visible || !data.enabled || data.sensitive) return { ok: false, reason: 'changed-target' };
    if (['READ', 'EXTRACT', 'VERIFY'].includes(action.op)) {
      return { ok: true, text: data.name, ...(action.op === 'VERIFY' ? { matches: data.name === action.value } : {}) };
    }
    if (action.op !== 'CLICK') return { ok: false, reason: 'unsupported' };
    const rect = entry.node.getBoundingClientRect();
    const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
    if (!hit || !(hit === entry.node || entry.node.contains(hit))) return { ok: false, reason: 'covered' };
    // Validation and dispatch share one synchronous JS turn. Page handler effects are untrusted.
    entry.node.click();
    return { ok: true };
  }
  Object.defineProperty(world, '__toastIR', { value: Object.freeze({ capture, perform }), configurable: false, writable: false });
}
