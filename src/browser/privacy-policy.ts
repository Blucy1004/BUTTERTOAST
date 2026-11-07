/** A small auditable starter list, not a complete anti-tracking database. */
export const TRACKER_HOSTS = ['google-analytics.com', 'doubleclick.net', 'googlesyndication.com', 'connect.facebook.net'];
const suffix = (host: string, root: string) => host === root || host.endsWith(`.${root}`);
export function shouldBlockTracker(target: string, page: string, resource: string, roots = TRACKER_HOSTS): boolean {
  if (resource === 'mainFrame') return false;
  try {
    const request = new URL(target), source = new URL(page);
    if (!['http:', 'https:', 'ws:', 'wss:'].includes(request.protocol) || !['http:', 'https:'].includes(source.protocol)) return false;
    const host = request.hostname.toLowerCase().replace(/\.$/, ''), top = source.hostname.toLowerCase().replace(/\.$/, '');
    return roots.some(root => suffix(host, root) && !suffix(top, root));
  } catch { return false; }
}
export function privateHeaders(url: string, headers: Record<string, string | string[]>): Record<string, string | string[]> {
  const result = { ...headers };
  for (const key of Object.keys(result)) {
    if (['sec-gpc', 'dnt'].includes(key.toLowerCase())) delete result[key];
    if (key.toLowerCase() === 'referer') {
      try {
        const value = result[key]; const referrer = new URL(Array.isArray(value) ? value[0] : value);
        const target = new URL(url);
        if (referrer.origin !== target.origin) {
          // Never disclose path, query or fragment to another origin, even if page opts into unsafe-url.
          if (referrer.protocol === 'https:' && target.protocol === 'http:') delete result[key];
          else result[key] = `${referrer.origin}/`;
        }
      } catch { delete result[key]; }
    }
  }
  result['Sec-GPC'] = '1'; result.DNT = '1'; return result;
}
