export type WorkspacePreferences = { left: number; right: number; leftCollapsed: boolean; rightCollapsed: boolean };
export type Bounds = { x: number; y: number; width: number; height: number };
export const defaultWorkspace = (): WorkspacePreferences => ({ left: 220, right: 420, leftCollapsed: false, rightCollapsed: false });
export function parseWorkspace(value: unknown): WorkspacePreferences | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  if (Object.keys(v).sort().join(',') !== 'left,leftCollapsed,right,rightCollapsed' || !Number.isSafeInteger(v.left) || !Number.isSafeInteger(v.right)
    || (v.left as number) < 160 || (v.left as number) > 420 || (v.right as number) < 300 || (v.right as number) > 720
    || typeof v.leftCollapsed !== 'boolean' || typeof v.rightCollapsed !== 'boolean') return null;
  return { left: v.left as number, right: v.right as number, leftCollapsed: v.leftCollapsed, rightCollapsed: v.rightCollapsed };
}
/** Main owns both Chromium and UI geometry. Preferences never supply arbitrary bounds. */
export function workspaceGeometry(width: number, height: number, p: WorkspacePreferences, narrowToast = false) {
  const margin = 16, gap = 12, top = 80, available = Math.max(0, width - margin * 2);
  const narrow = width < 760;
  const left = p.leftCollapsed || width < 1080 ? 52 : Math.min(p.left, Math.max(160, available - 636));
  const toastVisible = !p.rightCollapsed && (!narrow || narrowToast);
  const browserVisible = !narrow || !toastVisible;
  const right = toastVisible ? (narrow ? available - left - gap : Math.min(p.right, available - left - gap * 2 - 280)) : 0;
  const center = browserVisible ? available - left - gap - (toastVisible ? right + gap : 0) : 0;
  const panelHeight = Math.max(0, height - top - margin);
  const butter: Bounds = { x: margin, y: top, width: left, height: panelHeight };
  const browser: Bounds = { x: margin + left + gap, y: top, width: Math.max(0, center), height: panelHeight };
  const toast: Bounds = { x: width - margin - right, y: top, width: Math.max(0, right), height: panelHeight };
  const human: Bounds = { x: browser.x + 1, y: top + 117, width: Math.max(0,browser.width-2), height: Math.max(0, panelHeight - 118) };
  return { butter, browser, toast, human, browserVisible, toastVisible, compact: left === 52, narrow };
}
