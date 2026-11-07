import { AuthConfig } from './config';
import { normalizeEmail } from './protocol';
import { record } from '../security/ipc';
export type AuthFetch = (url: string, options: RequestInit) => Promise<Response>;
export class AuthFailure extends Error { constructor(public code: string) { super('Account request failed'); } }
export type AuthSession = { access: string; refresh: string; expiresAt: number; email: string; id: string };
// Refresh tokens are opaque server-issued strings; Supabase currently also issues 12-character values.
// Their authority is checked by the server, not by an invented client-side minimum length.
export function parseAuthSession(data: unknown, expectedEmail?: string, now = Date.now()): AuthSession {
  if (!record(data) || !record(data.user)) throw new AuthFailure('response');
  const email = normalizeEmail(data.user.email);
  if (!email || (expectedEmail && email !== expectedEmail) || typeof data.user.id !== 'string' || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(data.user.id)
    || typeof data.user.email_confirmed_at !== 'string' || !Number.isFinite(Date.parse(data.user.email_confirmed_at))
    || typeof data.access_token !== 'string' || data.access_token.length < 16 || data.access_token.length > 16384
    || typeof data.refresh_token !== 'string' || data.refresh_token.length === 0 || data.refresh_token.length > 4096 || /[\u0000-\u0020\u007f]/.test(data.refresh_token)
    || data.token_type !== 'bearer' || !Number.isSafeInteger(data.expires_in) || (data.expires_in as number) < 1 || (data.expires_in as number) > 86400) throw new AuthFailure('response');
  return { access: data.access_token, refresh: data.refresh_token, expiresAt: now + (data.expires_in as number) * 1000, email, id: data.user.id };
}
/** Main-only, fixed origin and routes; never return raw API errors or tokens to a renderer. */
export class AuthApi {
  constructor(private config: AuthConfig, private fetcher: AuthFetch) {}
  async request(route: 'signup' | 'token' | 'logout', body: object | null, signal: AbortSignal, query = '', bearer?: string): Promise<unknown> {
    const response = await this.fetcher(`${this.config.origin}/auth/v1/${route}${query}`, {
      method: 'POST', headers: { apikey: this.config.publishableKey, 'Content-Type': 'application/json', ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}) },
      body: body ? JSON.stringify(body) : undefined, redirect: 'error', credentials: 'omit', cache: 'no-store', signal
    });
    if (response.status >= 300 && response.status < 400) throw new AuthFailure('redirect');
    if (response.status === 204) return null;
    const reader = response.body?.getReader(); if (!reader) throw new AuthFailure('response');
    let bytes = 0; const chunks: Uint8Array[] = [];
    try {
      for (;;) { const { done, value } = await reader.read(); if (done) break; bytes += value.byteLength; if (bytes > 65536) { await reader.cancel(); throw new AuthFailure('response'); } chunks.push(value); }
    } finally { reader.releaseLock(); }
    let data: unknown;
    try { data = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw new AuthFailure('response'); }
    if (!response.ok) {
      const code = record(data) && typeof data.error_code === 'string' ? data.error_code : '';
      const known = ['email_not_confirmed', 'over_email_send_rate_limit', 'over_request_rate_limit', 'email_address_not_authorized', 'weak_password', 'signup_disabled'];
      throw new AuthFailure(known.includes(code) ? code : response.status === 429 ? 'over_request_rate_limit' : 'credentials');
    }
    return data;
  }
}
