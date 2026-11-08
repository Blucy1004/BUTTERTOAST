const {contextBridge,ipcRenderer}=require('electron');
const seen=[];
ipcRenderer.on('appearance:state',(_event,state)=>seen.push(state));
ipcRenderer.on('account:state',(_event,state)=>seen.push(state));
ipcRenderer.on('profile-probe',(_event,command)=>{ipcRenderer.send('account:command',command);ipcRenderer.send('appearance:ready');});
contextBridge.exposeInMainWorld('probe',{read:()=>seen});
