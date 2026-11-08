const {spawnSync}=require('node:child_process');
const flags=process.platform==='linux'?['--ozone-platform=headless','--disable-gpu']:[];
const result=spawnSync(require('electron'),[...flags,'test/profile-security.cjs'],{stdio:'inherit',timeout:120000});
if(result.error||result.signal)console.error('Profile checks did not complete',result.error?.code||result.signal);
process.exit(result.status??1);
