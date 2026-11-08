import { contextBridge, ipcRenderer } from 'electron';
contextBridge.exposeInMainWorld('appearance', {
  ready:()=>ipcRenderer.send('appearance:ready'),
  onState:(callback:(state:unknown)=>void)=>ipcRenderer.on('appearance:state',(_event,state)=>callback(state))
});
contextBridge.exposeInMainWorld('ai', {
  command: (command: unknown) => { ipcRenderer.send('ai:command', command); },
  onState: (callback: (state: unknown) => void) => { ipcRenderer.on('ai:state', (_event, state) => callback(state)); }
});
