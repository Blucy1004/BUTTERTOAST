import { exactKeys, record } from '../security/ipc';
import { AUTH_SETTINGS } from './config';
export type AuthCommand = { type: 'state' } | {type:'logout'} | {type:'reauthenticate'} | { type: 'signup' | 'login'; email: string; password: string }
  | {type:'recover';email:string} | {type:'password-update';password:string;currentPassword:string;nonce:string};
export type AuthState = { configured: boolean; status: 'signed-out' | 'pending-email' | 'signed-in'; email: string; busy: boolean; message: string; recovering?: boolean };
export function normalizeEmail(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 254) return null;
  const email = value.trim().toLowerCase();
  return /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email) && !/[\u0000-\u001f\u007f]/.test(email) ? email : null;
}
export function parseAuthCommand(input: unknown): AuthCommand | null {
  if (!record(input)) return null;
  if ((input.type === 'state' || input.type === 'logout' || input.type === 'reauthenticate') && exactKeys(input, ['type'])) return { type: input.type };
  if(input.type==='recover'&&exactKeys(input,['type','email'])) {const email=normalizeEmail(input.email);return email?{type:'recover',email}:null;}
  if(input.type==='password-update'&&exactKeys(input,['type','password','currentPassword','nonce'])&&typeof input.password==='string'&&Array.from(input.password).length>=8&&input.password.length<=1024&&!/[\u0000-\u001f\u007f]/.test(input.password)
    &&typeof input.currentPassword==='string'&&input.currentPassword.length<=1024&&!/[\u0000-\u001f\u007f]/.test(input.currentPassword)&&typeof input.nonce==='string'&&/^(?:[A-Za-z0-9_-]{1,128})?$/.test(input.nonce)) return {type:'password-update',password:input.password,currentPassword:input.currentPassword,nonce:input.nonce};
  if (!['signup', 'login'].includes(input.type as string) || !exactKeys(input, ['type', 'email', 'password'])) return null;
  const email = normalizeEmail(input.email);
  if (!email || typeof input.password !== 'string' || input.password.length > 1024 || /[\u0000-\u001f\u007f]/.test(input.password)) return null;
  if (Array.from(input.password).length < (input.type === 'signup' ? AUTH_SETTINGS.minimumPasswordLength : 1)) return null;
  return { type: input.type as 'signup' | 'login', email, password: input.password };
}
