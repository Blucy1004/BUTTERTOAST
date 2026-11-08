import { contextBridge, ipcRenderer } from 'electron';
contextBridge.exposeInMainWorld('appearance', {
  ready:()=>ipcRenderer.send('appearance:ready'),
  onState:(callback:(state:unknown)=>void)=>ipcRenderer.on('appearance:state',(_event,state)=>callback(state))
});
contextBridge.exposeInMainWorld('manager', {
  command: (value: unknown) => ipcRenderer.send('manager:command', value),
  onState: (callback: (state: unknown) => void) => ipcRenderer.on('manager:state', (_e, state) => callback(state)),
  onSection: (callback: (section: string) => void) => ipcRenderer.on('manager:section', (_e, section) => callback(section))
});
