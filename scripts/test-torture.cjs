const {spawnSync}=require('node:child_process'),fs=require('node:fs'),path=require('node:path');
const folder=path.resolve('artifacts/torture');fs.mkdirSync(folder,{recursive:true});
const electron=require('electron'),flags=process.platform==='linux'?['--ozone-platform=headless','--disable-gpu']:[];
const jobs=[
 ['provider',process.execPath,['--test','--test-reporter=tap','test/torture/provider.test.cjs'],75000],
 ['ai-dom',electron,[...flags,'test/torture/ai-dom.cjs'],180000],
 ['blocked-renderer',electron,[...flags,'test/torture/blocked-renderer.cjs'],18000],
 ...(process.platform==='linux'?[['restore',process.execPath,['scripts/torture-restore.cjs'],75000]]:[]),
 ...(process.env.DISPLAY||process.platform!=='linux'?[['native-browser',electron,['--disable-gpu','test/torture/native-browser.cjs'],45000]]:[])
];
const results=[];for(const [name,command,args,timeout] of jobs){const at=performance.now(),log=fs.openSync(path.join(folder,`${name}-suite.log`),'w');const result=spawnSync(command,args,{stdio:['ignore',log,log],timeout});fs.closeSync(log);results.push({name,code:result.status,signal:result.signal,error:result.error?.message,elapsedMs:performance.now()-at,log:`${name}-suite.log`});console.log(result.status===0?'PASS':'FAIL',name,results.at(-1).elapsedMs.toFixed(0)+'ms');}
fs.writeFileSync(path.join(folder,'targeted-suite.json'),JSON.stringify({generatedAt:new Date().toISOString(),results,unverified:process.platform==='linux'&&!process.env.DISPLAY?['Native display test: run separately under Xvfb or desktop']:[]},null,2));process.exitCode=results.some(r=>r.code!==0)?1:0;
