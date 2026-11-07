// These identifiers are public client configuration. Never put a secret/service_role key here.
export const PROJECT_URL = 'https://nlnnrmswustfiloqxyxh.supabase.co';
export const PUBLISHABLE_KEY = 'sb_publishable_a9YOowv9T7bBTZQPCpsj6A_-cQny7ZK';
export const AUTH_SETTINGS = Object.freeze({ minimumPasswordLength: 8, emailExpirySeconds: 3600 });
export type AuthConfig = { origin: string; publishableKey: string };
export function parseAuthConfig(url: unknown, key: unknown): AuthConfig | null {
  if (typeof url !== 'string' || typeof key !== 'string' || !/^sb_publishable_[A-Za-z0-9_-]{16,200}$/.test(key)) return null;
  try {
    const u = new URL(url);
    if (u.protocol !== 'https:' || !/^[a-z0-9]{10,40}\.supabase\.co$/.test(u.hostname) || u.port || u.username || u.password || u.pathname !== '/' || u.search || u.hash) return null;
    return Object.freeze({ origin: u.origin, publishableKey: key });
  } catch { return null; }
}
