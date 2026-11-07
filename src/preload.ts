import { contextBridge, ipcRenderer } from 'electron';
contextBridge.exposeInMainWorld('browser', {
  command: (command: unknown) => ipcRenderer.send('browser:command', command),
  onFocusAddress: (callback: () => void) => ipcRenderer.on('browser:focus-address', () => callback()),
  onState: (callback: (state: unknown) => void) => ipcRenderer.on('browser:state', (_event, state) => callback(state))
});
