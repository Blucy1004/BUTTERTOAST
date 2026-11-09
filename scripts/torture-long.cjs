const {spawn,execFileSync}=require('node:child_process');
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const quick=process.argv.includes('--quick');
function option(name,fallback){const i=process.argv.indexOf(name);if(i<0)return fallback;if(!process.argv[i+1]||process.argv[i+1].startsWith('--'))throw Error('Missing '+name);return path.resolve(process.argv[i+1]);}
const folder=option('--output',path.resolve('artifacts/torture',`long-${quick?'pilot-':''}${new Date().toISOString().replace(/[:.]/g,'-')}`));
if(fs.existsSync(folder))throw Error('Output exists; choose a fresh output directory to preserve evidence');
fs.mkdirSync(folder,{recursive:true});
const baseline=option('--baseline',path.join(folder,'baseline-app'));
if(!process.argv.includes('--baseline')){
 fs.mkdirSync(baseline);fs.cpSync('dist',path.join(baseline,'dist'),{recursive:true});fs.copyFileSync('package.json',path.join(baseline,'package.json'));
 const hash=crypto.createHash('sha256');function hashTree(dir){for(const item of fs.readdirSync(dir,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name))){const file=path.join(dir,item.name);if(item.isDirectory())hashTree(file);else{hash.update(path.relative(baseline,file));hash.update(fs.readFileSync(file));}}}hashTree(baseline);
 fs.writeFileSync(path.join(baseline,'source.json'),JSON.stringify({version:require('../package.json').version,head:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),dirty:!!execFileSync('git',['status','--porcelain'],{encoding:'utf8'}).trim(),frozenPayloadSha256:hash.digest('hex'),frozenAt:new Date().toISOString()},null,2));
}
if(!fs.existsSync(path.join(baseline,'dist/main.js'))||!fs.existsSync(path.join(baseline,'source.json')))throw Error('Invalid frozen baseline');
const durations={A:900000,B:1800000,C:300000};
function worker(engine,scenario){return new Promise(resolve=>{
 const output=path.join(folder,`${engine}-${scenario}.json`),log=fs.openSync(output+'.log','w');
 const command=engine==='buttertoast'?require('electron'):process.execPath;
 const args=engine==='buttertoast'?[...(process.platform==='linux'?['--ozone-platform=headless','--disable-gpu']:[]),'test/torture/long-electron.cjs']:['test/torture/long-chrome.cjs'];
 const child=spawn(command,args,{stdio:['ignore',log,log],env:{...process.env,BT_TORTURE_SCENARIO:scenario,...(quick?{BT_TORTURE_DURATION_MS:'5000'}:{}),BT_TORTURE_BASELINE:baseline,BT_TORTURE_OUTPUT:output}});
 const timer=setTimeout(()=>child.kill('SIGTERM'),(quick?5000:durations[scenario])+180000);let error;
 child.once('error',e=>{error=e.message});child.once('close',(code,signal)=>{clearTimeout(timer);fs.closeSync(log);resolve({engine,scenario,code,signal,error,output})});
 });}
(async()=>{
 const results=[],startedAt=new Date().toISOString();console.log('Frozen baseline:',baseline,'Evidence:',folder);
 for(const scenario of ['A','B','C']){
  const result=await Promise.all(['buttertoast','chrome'].map(engine=>worker(engine,scenario)));results.push(...result);
  fs.writeFileSync(path.join(folder,'runs.json'),JSON.stringify({startedAt,quick,concurrentBrowsers:true,results},null,2));
  console.log('SCENARIO_FINISHED',scenario,JSON.stringify(result));
 }
 process.exitCode=results.some(r=>r.code!==0)?1:0;
})().catch(e=>{console.error(e);process.exitCode=1});
