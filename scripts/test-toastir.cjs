const {spawnSync}=require('node:child_process');
const flags=process.platform==='linux'?['--ozone-platform=headless','--disable-gpu']:[];
const r=spawnSync(require('electron'),[...flags,'test/toastir-security.cjs'],{stdio:'inherit',timeout:60000});
if(r.error||r.signal)console.error('ToastIR test did not complete:',r.error?.code||r.signal);
process.exit(r.status??1);
