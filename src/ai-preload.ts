import { contextBridge, ipcRenderer } from 'electron';
contextBridge.exposeInMainWorld('ai', {
  command: (command: unknown) => { ipcRenderer.send('ai:command', command); },
  onState: (callback: (state: unknown) => void) => { ipcRenderer.on('ai:state', (_event, state) => callback(state)); }
});
