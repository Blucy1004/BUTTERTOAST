const { spawnSync } = require('node:child_process');
const electron = require('electron');
const flags = process.platform === 'linux' ? ['--ozone-platform=headless', '--disable-gpu'] : [];
const result = spawnSync(electron, [...flags, 'test/browser-lifecycle.cjs'], { stdio: 'inherit', timeout: 75000 });
if (result.error || result.signal) console.error('Browser lifecycle tests did not complete:', result.error?.code || result.signal);
process.exit(result.status ?? 1);
