// Actual production app, fresh profile, local deterministic pages. No live accounts or model calls.
const {app,BrowserWindow,webContents,session}=require('electron');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),assert=require('node:assert/strict');
const {fixture,measuredIdle,wait}=require('../scripts/benchmark-support.cjs');
const entry=Date.now(),duration=Number(process.env.BUTTERTOAST_SOAK_MS||300000);
if(!Number.isSafeInteger(duration)||duration<0||duration>3600000)throw Error('Invalid soak duration');
app.setPath('userData',fs.mkdtempSync(path.join(os.tmpdir(),'bt-production-soak-')));
const deadline=setTimeout(()=>{console.error('Full-app smoke/soak timed out');app.exit(1)},duration+90000);
async function until(fn,label){for(let i=0;i<500;i++){if(await fn())return;await wait(20)}throw Error(label)}
require('../dist/main');
app.whenReady().then(async()=>{
 const main=BrowserWindow.getAllWindows()[0],ui=main.webContents;main.setContentSize(1440,900);
 await until(async()=>!ui.isLoading()&&await ui.executeJavaScript('!document.getElementById("new").disabled'),'production app ready');
 const startup={entryToReadyMs:Date.now()-entry,spawnToReadyMs:process.env.BUTTERTOAST_BENCH_START_EPOCH_MS?Date.now()-Number(process.env.BUTTERTOAST_BENCH_START_EPOCH_MS):null};console.log('UI_READY',JSON.stringify(startup));
 if(duration===0){fs.writeFileSync(process.env.BUTTERTOAST_BENCH_OUTPUT,JSON.stringify(startup));clearTimeout(deadline);main.destroy();app.exit(0);return;}
 fs.mkdirSync('artifacts',{recursive:true});
 for(const theme of ['dark','light']){
  if(await ui.executeJavaScript('document.documentElement.dataset.theme')!==theme)await ui.executeJavaScript('document.getElementById("theme-toggle").click()');
  await until(()=>ui.executeJavaScript(`document.documentElement.dataset.theme===${JSON.stringify(theme)}`),'theme');
  await ui.executeJavaScript('document.fonts.ready.then(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))))');await wait(250);
  fs.writeFileSync(`artifacts/golden-${theme}-workspace.png`,(await ui.capturePage(undefined,{stayAwake:true})).toPNG());
 }
 if(process.env.BUTTERTOAST_CAPTURE_ONLY==='1'){clearTimeout(deadline);main.destroy();app.exit(0);return;}
 const browsing=session.fromPartition('persist:human');browsing.protocol.handle('https',()=>new Response(fixture,{headers:{'Content-Type':'text/html'}}));
 await ui.executeJavaScript('window.lastBrowserState=null;browser.onState(s=>lastBrowserState=s);browser.command({type:"ready"})');
 await until(()=>ui.executeJavaScript('lastBrowserState!==null'),'state');
 const send=async command=>{await wait(125);return ui.executeJavaScript(`browser.command(${JSON.stringify(command)})`);},state=()=>ui.executeJavaScript('lastBrowserState');
 for(let i=0;i<50;i++){
  if(i)await send({type:'new'});await send({type:'navigate',address:`https://soak-${i}.test/page`});
  await until(async()=>{const s=await state();return s.url===`https://soak-${i}.test/page`&&!s.loading},'fixture ready');
 }
 const ids=(await state()).tabs.map(t=>t.id);assert.equal(ids.length,50);
 const samples=[{elapsedMs:0,...await measuredIdle()}],started=Date.now();let switches=0,reloads=0,nextSample=60000,crashes=0;
 const crash=(_event,details)=>{if(details.reason!=='clean-exit')crashes++;};
 for(const wc of webContents.getAllWebContents())wc.on('render-process-gone',crash);
 while(Date.now()-started<duration){
  await send({type:'select',id:ids[switches%ids.length]});switches++;
  if(switches%20===0){await send({type:'reload'});reloads++;await until(async()=>!(await state()).loading,'reload complete');}
  assert.equal((await state()).tabs.some(t=>['crashed','unresponsive'].includes(t.status)),false,'Responsive live tabs');
  if(Date.now()-started>=nextSample){samples.push({elapsedMs:Date.now()-started,...await measuredIdle()});console.log('SOAK',Math.round((Date.now()-started)/1000),'seconds',switches,'switches');nextSample+=60000;}
  await wait(500);
 }
 samples.push({elapsedMs:Date.now()-started,...await measuredIdle()});assert.equal(crashes,0);
 fs.writeFileSync('artifacts/performance-golden-full-app.json',JSON.stringify({version:require('../package.json').version,startup,durationMs:Date.now()-started,tabs:50,switches,reloads,crashes,samples,generatedAt:new Date().toISOString()},null,2)+'\n');
 console.log('PASS full production app soak',switches,'switches',reloads,'reloads');clearTimeout(deadline);main.destroy();app.exit(0);
}).catch(error=>{console.error(error);clearTimeout(deadline);app.exit(1)});
