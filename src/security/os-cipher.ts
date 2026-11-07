import { safeStorage } from 'electron';
import { OsCipher } from './vault';
export const osCipher: OsCipher = {
  available: async () => await safeStorage.isAsyncEncryptionAvailable() && (process.platform !== 'linux' || safeStorage.getSelectedStorageBackend() !== 'basic_text'),
  encrypt: value => safeStorage.encryptStringAsync(value), decrypt: async value => (await safeStorage.decryptStringAsync(value)).result
};
