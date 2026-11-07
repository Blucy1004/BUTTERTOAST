const fs = require('node:fs');
for (const name of ['index.html', 'ui.js', 'tabs.js', 'toolbar.js', 'style.css']) fs.copyFileSync(`src/${name}`, `dist/${name}`);
