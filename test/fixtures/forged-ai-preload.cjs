const { ipcRenderer } = require('electron');
ipcRenderer.send('ai:command', { type: 'connect', provider: 'openai', endpoint: 'https://api.openai.com/v1', key: 'forged-fixture-key', remember: false });
ipcRenderer.send('ai:command', { type: 'approve' });
