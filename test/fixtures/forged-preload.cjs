const { ipcRenderer } = require('electron');
ipcRenderer.send('browser:command', { type: 'new' });
ipcRenderer.send('browser:command', { type: 'navigate', address: 'https://exfil.invalid/' });
