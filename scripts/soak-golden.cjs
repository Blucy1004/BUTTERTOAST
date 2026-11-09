const {spawnSync}=require('node:child_process'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
fs.mkdirSync('artifacts',{recursive:true});const directory=fs.mkdtempSync(path.join(os.tmpdir(),'bt-startup-results-')),startups=[];
const flags=process.platform==='linux'?['--ozone-platform=headless','--disable-gpu']:[];
try{
 for(let i=0;i<3;i++){
  const file=path.join(directory,`${i}.json`),result=spawnSync(require('electron'),[...flags,'test/soak-golden.cjs'],{stdio:'inherit',timeout:90000,env:{...process.env,BUTTERTOAST_SOAK_MS:'0',BUTTERTOAST_BENCH_OUTPUT:file,BUTTERTOAST_BENCH_START_EPOCH_MS:String(Date.now())}});
  if(result.status!==0)process.exit(result.status??1);startups.push(JSON.parse(fs.readFileSync(file,'utf8')));
 }
 fs.writeFileSync('artifacts/performance-golden-startup.json',JSON.stringify({freshProfiles:true,osFilesystemCacheCleared:false,iterations:startups,generatedAt:new Date().toISOString()},null,2)+'\n');
 const result=spawnSync(require('electron'),[...flags,'test/soak-golden.cjs'],{stdio:'inherit',timeout:400000,env:{...process.env,BUTTERTOAST_SOAK_MS:'300000',BUTTERTOAST_BENCH_START_EPOCH_MS:String(Date.now())}});process.exitCode=result.status??1;
}finally{fs.rmSync(directory,{recursive:true,force:true})}
