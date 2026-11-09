const {spawn}=require('node:child_process'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {chromium}=require(process.env.BUTTERTOAST_PLAYWRIGHT_MODULE||'playwright-core'),{until,stats}=require('../test/torture/long-common.cjs');
const rows=[];let child,browser;
(async()=>{
 for(let round=1;round<=3;round++)for(const engine of round%2?['ButterToast','Chrome']:['Chrome','ButterToast']){
  const profile=fs.mkdtempSync(path.join(os.tmpdir(),'bt-startup-')),output=path.join(profile,'ready.json'),start=performance.now();
  if(engine==='ButterToast'){
   child=spawn(require('electron'),['--ozone-platform=headless','--disable-gpu','test/torture/startup-worker.cjs'],{stdio:'ignore',env:{...process.env,BT_TORTURE_PROFILE:profile,BT_TORTURE_OUTPUT:output}});
   await until(()=>{if(child.exitCode!==null&&child.exitCode!==0)throw Error('ButterToast startup failed');return fs.existsSync(output)},'ButterToast ready');const report=JSON.parse(fs.readFileSync(output));rows.push({engine,round,elapsedMs:performance.now()-start,version:report.versions.electron});if(child.exitCode===null)await new Promise(resolve=>child.once('exit',resolve));
  }else{
   child=spawn(process.env.BUTTERTOAST_CHROME_PATH,['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check','--site-per-process','--remote-debugging-port=0',`--user-data-dir=${profile}`,'about:blank'],{stdio:'ignore'});let port;
   await until(()=>{if(child.exitCode!==null)throw Error('Chrome startup failed');try{port=Number(fs.readFileSync(path.join(profile,'DevToolsActivePort'),'utf8').split('\n')[0]);return !!port}catch{return false}},'Chrome CDP');browser=await chromium.connectOverCDP(`http://127.0.0.1:${port}`);await browser.contexts()[0].pages()[0].evaluate('document.readyState');rows.push({engine,round,elapsedMs:performance.now()-start,version:browser.version()});await browser.close();browser=null;
  }
 }
 fs.writeFileSync('artifacts/torture/startup.json',JSON.stringify({generatedAt:new Date().toISOString(),rows,summaries:['ButterToast','Chrome'].map(engine=>({engine,...stats(rows.filter(r=>r.engine===engine).map(r=>r.elapsedMs))})),scope:'Fresh profiles, headless, inherited OS file cache not cleared. Parent spawn-to-automation-ready, ButterToast production UI/IPC vs Chrome blank-page/CDP. Different readiness probes and Chromium versions; concurrent A/B/C workload. Not cold-machine startup or a performance ranking.'},null,2));console.log('PASS startup samples',rows);
})().catch(async e=>{console.error(e);await browser?.close().catch(()=>{});child?.kill('SIGKILL');process.exitCode=1});
