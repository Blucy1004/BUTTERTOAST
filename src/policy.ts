/** Only normal web documents are allowed in untrusted browsing views. */
export function isWebUrl(value: string): boolean {
  try {
    const u = new URL(value);
    return (u.protocol === 'https:' || u.protocol === 'http:') && !!u.hostname && !u.username && !u.password;
  } catch { return false; }
}

/** Bare hosts default to HTTPS; other text is sent to the configured search provider. */
export function resolveAddress(value: string): string | null {
  const input = value.trim();
  if (!input || input.length > 4096 || /[\u0000-\u001f\u007f]/.test(input)) return null;
  if (/^[a-z][a-z\d+.-]*:/i.test(input) && !/^(localhost|\d{1,3}(?:\.\d{1,3}){3}):\d+(?:[/?#]|$)/i.test(input)) return isWebUrl(input) ? new URL(input).href : null;
  if (!/\s/.test(input) && (/^(localhost|\d{1,3}(?:\.\d{1,3}){3})(:\d+)?(?:[/?#]|$)/i.test(input) || /^[^/]+\.[^/]+/.test(input))) {
    const candidate = `https://${input}`;
    return isWebUrl(candidate) ? new URL(candidate).href : null;
  }
  return `https://www.google.com/search?q=${encodeURIComponent(input)}`;
}
