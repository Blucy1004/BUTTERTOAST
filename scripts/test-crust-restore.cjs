const {spawnSync}=require('node:child_process'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const folder=fs.mkdtempSync(path.join(os.tmpdir(),'bt-crust-restore-')),flags=process.platform==='linux'?['--ozone-platform=headless','--disable-gpu']:[];
let code=0;
try{for(const mode of ['prepare','restore']){const r=spawnSync(require('electron'),[...flags,'test/crust-restore.cjs'],{stdio:'inherit',timeout:45000,env:{...process.env,BT_CRUST_PROFILE:folder,BT_CRUST_MODE:mode}});if(r.error||r.status!==0){code=1;break;}}}finally{fs.rmSync(folder,{recursive:true,force:true});}
process.exit(code);
