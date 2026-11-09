const {app,BrowserWindow,session}=require('electron'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {treeMetrics,summary,wait,fixture}=require('../scripts/benchmark-support.cjs');
const root=process.env.BT_CRUST_CORE||path.resolve('dist'),output=process.env.BT_CRUST_BENCH_OUTPUT;
if(app.isPackaged||!output)throw Error('Development benchmark output required');
const {BrowserTabs}=require(path.join(root,'browser/tabs')),{WEB_PREFERENCES,hardenSession}=require(path.join(root,'security/electron'));
app.enableSandbox();app.commandLine.appendSwitch('site-per-process');app.setPath('userData',fs.mkdtempSync(path.join(os.tmpdir(),'bt-crust-bench-')));
const start=performance.now(),deadline=setTimeout(()=>app.exit(1),60000);
app.whenReady().then(async()=>{
 const human=session.fromPartition('persist:human');hardenSession(human);human.protocol.handle('https',()=>new Response(fixture,{headers:{'Content-Type':'text/html'}}));
 const win=new BrowserWindow({show:true,width:1050,height:720,webPreferences:{...WEB_PREFERENCES}});const tabs=new BrowserTabs(win,{changed(){},persist(){},input(){}});tabs.setViewport({x:0,y:0,width:1050,height:720});
 const ids=[],loads=[],switches=[],samples=[];let crashes=0,unresponsive=0;
 for(let i=0;i<10;i++){const at=performance.now();tabs.newTab(`https://bench${i}.test/`);const wc=tabs.activeContents();wc.on('render-process-gone',()=>crashes++);wc.on('unresponsive',()=>unresponsive++);await new Promise(resolve=>wc.once('did-finish-load',resolve));ids.push(tabs.state().active);loads.push(performance.now()-at);}
 const setupMs=performance.now()-start;for(const id of ids){tabs.select(id);await tabs.activeContents().executeJavaScript('document.readyState');}
 const begin=performance.now(),wall=Date.now(),cpuBefore=treeMetrics();let ticks=0,nextSample=0;
 while(performance.now()-begin<20000){const at=performance.now();tabs.select(ids[ticks%ids.length]);await tabs.activeContents().executeJavaScript('window.scrollBy(0,16);document.readyState');switches.push(performance.now()-at);if(performance.now()-begin>=nextSample){samples.push({elapsedMs:performance.now()-begin,...treeMetrics()});nextSample+=2000;}ticks++;await wait(Math.max(0,100-(performance.now()-at)));}
 const cpuAfter=treeMetrics(),elapsedMs=performance.now()-begin;
 const report={schema:'golden-crust-core/1',label:process.env.BT_CRUST_LABEL,platform:process.platform,versions:{electron:process.versions.electron,chrome:process.versions.chrome},tabs:10,viewport:{width:1050,height:720},setupMs,elapsedMs,wallElapsedMs:Date.now()-wall,loads:summary(loads),switches:summary(switches),ticks,crashes,unresponsive,cpuPercent:(cpuAfter.cpuTicks-cpuBefore.cpuTicks)/100/(elapsedMs/1000)*100,samples,limitations:['BrowserTabs core on a deterministic local fixture, not the full browser UI or real websites.','RSS sums shared pages; PSS availability and process counts are recorded separately.','CPU from Linux /proc live process tree ticks, not a portable OS profiler.','20-second measurement, not a long-duration soak or a Chrome superiority claim.']};
 fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({label:report.label,elapsedMs,loads:report.loads,switches:report.switches,crashes,unresponsive}));tabs.dispose();win.destroy();clearTimeout(deadline);app.exit(0);
}).catch(e=>{console.error(e);app.exit(1);});
