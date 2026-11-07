import { contextBridge, ipcRenderer } from 'electron';
contextBridge.exposeInMainWorld('browser', {
  command: (command: unknown) => ipcRenderer.send('browser:command', command),
  onState: (callback: (state: unknown) => void) => ipcRenderer.on('browser:state', (_event, state) => callback(state))
});
