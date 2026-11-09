const {spawnSync}=require('node:child_process');
const flags=process.platform==='linux'?['--ozone-platform=headless','--disable-gpu']:[];
const result=spawnSync(require('electron'),[...flags,'test/crust-security.cjs'],{stdio:'inherit',timeout:120000});
if(result.error||result.signal)console.error('Crust tests incomplete',result.error?.code||result.signal);
if(result.status!==0)process.exit(result.status??1);
const restore=spawnSync(process.execPath,['scripts/test-crust-restore.cjs'],{stdio:'inherit',timeout:95000});process.exit(restore.status??1);
