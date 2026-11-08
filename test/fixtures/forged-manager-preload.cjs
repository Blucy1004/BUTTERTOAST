const {ipcRenderer}=require('electron');
ipcRenderer.send('manager:command',{type:'settings',settings:{search:'brave',theme:'dark',history:false,restoreTabs:false}});
ipcRenderer.send('manager:command',{type:'history-clear'});
