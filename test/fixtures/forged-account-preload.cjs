const { ipcRenderer } = require('electron');
ipcRenderer.send('account:command', { type: 'login', email: 'attacker@example.test', password: 'fixture-password' });
ipcRenderer.send('account:command', { type: 'logout' });
