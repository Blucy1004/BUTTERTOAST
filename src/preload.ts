import { contextBridge, ipcRenderer } from 'electron';
contextBridge.exposeInMainWorld('appearance', {
  ready:()=>ipcRenderer.send('appearance:ready'),
  onState:(callback:(state:unknown)=>void)=>ipcRenderer.on('appearance:state',(_event,state)=>callback(state))
});
contextBridge.exposeInMainWorld('browser', {
  command: (command: unknown) => { ipcRenderer.send('browser:command', command); },
  onFocusAddress: (callback: () => void) => { ipcRenderer.on('browser:focus-address', () => callback()); },
  onFocusTools: (callback: (tool:'find'|'tabs') => void) => { ipcRenderer.on('browser:focus-tools', (_event,tool) => {if(tool==='find'||tool==='tabs')callback(tool);}); },
  onCommandResults:(callback:(state:unknown)=>void)=>ipcRenderer.on('browser:command-results',(_event,state)=>callback(state)),
  onSuggestions:(callback:(state:unknown)=>void)=>ipcRenderer.on('browser:suggestions',(_event,state)=>callback(state)),
  onState: (callback: (state: unknown) => void) => { ipcRenderer.on('browser:state', (_event, state) => callback(state)); }
});
