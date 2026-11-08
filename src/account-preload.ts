import { contextBridge, ipcRenderer } from 'electron';
contextBridge.exposeInMainWorld('appearance', {
  ready:()=>ipcRenderer.send('appearance:ready'),
  onState:(callback:(state:unknown)=>void)=>ipcRenderer.on('appearance:state',(_event,state)=>callback(state))
});
contextBridge.exposeInMainWorld('account', {
  command: (command: unknown) => { ipcRenderer.send('account:command', command); },
  onState: (callback: (state: unknown) => void) => { ipcRenderer.on('account:state', (_event, state) => callback(state)); }
});
