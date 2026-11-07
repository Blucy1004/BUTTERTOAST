const fs = require('node:fs');
for (const name of ['index.html', 'ui.js', 'tabs.js', 'toolbar.js', 'style.css', 'tokens.css', 'account.html', 'account.css', 'account.js']) fs.copyFileSync(`src/${name}`, `dist/${name}`);
