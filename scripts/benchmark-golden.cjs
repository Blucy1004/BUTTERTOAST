const {spawnSync}=require('node:child_process'),fs=require('node:fs');fs.mkdirSync('artifacts',{recursive:true});
const flags=process.platform==='linux'?['--ozone-platform=headless','--disable-gpu']:[];
let result=spawnSync(require('electron'),[...flags,'test/benchmark-golden-electron.cjs'],{stdio:'inherit',timeout:200000});if(result.status!==0)process.exit(result.status??1);
if(process.env.BUTTERTOAST_CHROME_PATH){result=spawnSync(process.execPath,['scripts/benchmark-chrome.cjs'],{stdio:'inherit',timeout:200000});if(result.status!==0)process.exit(result.status??1);}else console.log('Chrome comparison not run: set BUTTERTOAST_CHROME_PATH.');
