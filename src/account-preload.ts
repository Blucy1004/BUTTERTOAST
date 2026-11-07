import { contextBridge, ipcRenderer } from 'electron';
contextBridge.exposeInMainWorld('account', {
  command: (command: unknown) => { ipcRenderer.send('account:command', command); },
  onState: (callback: (state: unknown) => void) => { ipcRenderer.on('account:state', (_event, state) => callback(state)); }
});
