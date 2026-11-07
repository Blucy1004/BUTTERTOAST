import { exactKeys, record } from '../security/ipc';
import { AUTH_SETTINGS } from './config';
export type AuthCommand = { type: 'state' } | { type: 'logout' } | { type: 'signup' | 'login'; email: string; password: string };
export type AuthState = { configured: boolean; status: 'signed-out' | 'pending-email' | 'signed-in'; email: string; busy: boolean; message: string };
export function normalizeEmail(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 254) return null;
  const email = value.trim().toLowerCase();
  return /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email) && !/[\u0000-\u001f\u007f]/.test(email) ? email : null;
}
export function parseAuthCommand(input: unknown): AuthCommand | null {
  if (!record(input)) return null;
  if ((input.type === 'state' || input.type === 'logout') && exactKeys(input, ['type'])) return { type: input.type };
  if (!['signup', 'login'].includes(input.type as string) || !exactKeys(input, ['type', 'email', 'password'])) return null;
  const email = normalizeEmail(input.email);
  if (!email || typeof input.password !== 'string' || input.password.length > 1024 || /[\u0000-\u001f\u007f]/.test(input.password)) return null;
  if (Array.from(input.password).length < (input.type === 'signup' ? AUTH_SETTINGS.minimumPasswordLength : 1)) return null;
  return { type: input.type as 'signup' | 'login', email, password: input.password };
}
