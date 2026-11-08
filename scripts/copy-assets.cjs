const fs = require('node:fs');
fs.mkdirSync('dist/guidance', {recursive:true});
for (const name of ['workspace.js', 'starfield.png', 'cursor.html', 'cursor.css']) fs.copyFileSync(`src/${name}`, `dist/${name}`);
for (const name of ['SYSTEM.md','ACTIONS.md','HANDOFF.md','RECOVERY.md']) fs.copyFileSync(name, `dist/guidance/${name}`);
for (const name of ['manager.html', 'manager.css', 'manager.js']) fs.copyFileSync(`src/${name}`, `dist/${name}`);
for (const name of ['index.html', 'ui.js', 'tabs.js', 'toolbar.js', 'style.css', 'tokens.css', 'account.html', 'account.css', 'account.js', 'ai.html', 'ai.css', 'ai.js', 'ai-settings.js']) fs.copyFileSync(`src/${name}`, `dist/${name}`);
