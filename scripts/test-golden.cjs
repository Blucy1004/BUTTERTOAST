const {spawnSync}=require('node:child_process');
const flags=process.platform==='linux'?['--ozone-platform=headless','--disable-gpu']:[];
const r=spawnSync(require('electron'),[...flags,'test/golden-security.cjs'],{stdio:'inherit',timeout:90000});
if(r.error||r.signal)console.error('Golden Toast test did not complete:',r.error?.code||r.signal);process.exit(r.status??1);
