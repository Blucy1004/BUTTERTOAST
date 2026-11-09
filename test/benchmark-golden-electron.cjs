const {app,BrowserWindow,session}=require('electron'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{performance}=require('node:perf_hooks');
const {BrowserTabs}=require('../dist/browser/tabs'),{WEB_PREFERENCES,hardenSession}=require('../dist/security/electron'),{ToastController}=require('../dist/toastir/controller'),{modelSnapshot,chooseModelFrame}=require('../dist/toastir/model');
const {fixture,summary,measuredIdle,wait}=require('../scripts/benchmark-support.cjs');
const start=performance.now();app.enableSandbox();app.commandLine.appendSwitch('site-per-process');app.setPath('userData',fs.mkdtempSync(path.join(os.tmpdir(),'bt-perf-')));
const deadline=setTimeout(()=>{console.error('Benchmark timeout');app.exit(1)},180000);
async function until(fn){for(let i=0;i<1000;i++){if(await fn())return;await wait(10)}throw Error('Page did not become ready')}
app.whenReady().then(async()=>{
 const host=new BrowserWindow({width:1050,height:720,useContentSize:true,show:true,webPreferences:WEB_PREFERENCES});await host.loadURL('about:blank');
 const browsing=session.fromPartition('persist:human');hardenSession(browsing);browsing.protocol.handle('https',()=>new Response(fixture,{headers:{'Content-Type':'text/html','Cache-Control':'no-store'}}));
 const tabs=new BrowserTabs(host,{changed(){},persist(){},input(){}});tabs.setViewport({x:0,y:0,width:1050,height:720});tabs.initialize(null);
 const readyMs=performance.now()-start,results=[];let made=0;
 for(const count of [10,25,50]){
  const loads=[];
  while(made<count){const url=`https://fixture-${made}.test/page`;const at=performance.now();if(made)tabs.newTab(url);else tabs.navigate(url);const wc=tabs.activeContents();await until(()=>!wc.isLoading()&&wc.getURL()===url);await wc.executeJavaScript('document.readyState');loads.push(performance.now()-at);made++;}
  const switches=[];for(const tab of tabs.state().tabs.slice(0,10)){const at=performance.now();tabs.select(tab.id);await tabs.activeContents().executeJavaScript('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');switches.push(performance.now()-at);}
  if(tabs.state().tabs.some(t=>['crashed','unresponsive'].includes(t.status)))throw Error('Tab failed');results.push({tabs:count,load:summary(loads),switch:summary(switches),memory:await measuredIdle()});console.log(`Measured ButterToast ${count} tabs`);
 }
 const wc=tabs.activeContents(),controller=new ToastController(wc);controller.grant(new Set(['read','write','transmit','delete','pay']));
 const capture=[],raw=[],execution=[],direct=[],fullBytes=[],compactBytes=[],deltaBytes=[];let previous=null,successes=0,stats=null;
 const from=s=>modelSnapshot({source:'task',origin:s.origin,document:s.document,version:s.version,text:s.text,elements:s.elements.filter(e=>e.visible&&!e.sensitive&&e.enabled).slice(0,100)});
 for(let i=0;i<12;i++){
  let at=performance.now();const html=await wc.executeJavaScript('document.documentElement.outerHTML');raw.push(performance.now()-at);
  at=performance.now();const snapshot=await controller.snapshot();capture.push(performance.now()-at);stats=await controller.statistics();const compact=from(snapshot),frame=chooseModelFrame(compact,previous);previous=compact;
  fullBytes.push(Buffer.byteLength(JSON.stringify(snapshot)));compactBytes.push(Buffer.byteLength(JSON.stringify(compact)));deltaBytes.push(Buffer.byteLength(JSON.stringify(frame)));
  const target=snapshot.elements.find(e=>e.name==='Benchmark action');const action={protocol:2,document:snapshot.document,id:`bench-${i}`,tab:snapshot.tab,origin:snapshot.origin,version:snapshot.version,op:'CLICK',target:target.id,value:''};
  at=performance.now();const approval=await controller.requestApproval(action,async()=>true),result=await controller.execute(action,approval);execution.push(performance.now()-at);if(result.ok&&await wc.executeJavaScript('window.count')===(i+1)*2-1)successes++;
  at=performance.now();await wc.executeJavaScript('document.getElementById("action").click()');direct.push(performance.now()-at);if(await wc.executeJavaScript('window.count')!==(i+1)*2)throw Error('Direct DOM action failed');
 }
 controller.dispose();
 const soakStart=performance.now();for(let i=0;i<60;i++){const tab=tabs.state().tabs[i%50];tabs.select(tab.id);await tabs.activeContents().executeJavaScript('document.readyState');await wait(100);}
 const beforeRelease=await measuredIdle();for(const tab of tabs.state().tabs.slice(0,-1)){tabs.select(tab.id);tabs.suspend();}tabs.select(tabs.state().tabs.at(-1).id);const afterRelease=await measuredIdle();
 const report={engine:'ButterToast browser core',version:require('../package.json').version,electron:process.versions.electron,chromium:process.versions.chrome,readyMs,results,
  toastir:{capture:summary(capture),rawDomCapture:summary(raw),guardedDispatch:summary(execution),directDomDispatch:summary(direct),successes,attempts:12,retries:0,fixtureApprovals:12,realHumanApprovalTimeIncluded:false,htmlBytes:Buffer.byteLength(fixture),fullJsonBytes:fullBytes,compactJsonBytes:compactBytes,selectedFrameBytes:deltaBytes,captureStatistics:stats,realModelTokens:null},
  shortSoak:{durationMs:performance.now()-soakStart,switches:60,crashes:0},memoryRelease:{logicalTabs:50,before:beforeRelease,after:afterRelease},generatedAt:new Date().toISOString()};
 fs.mkdirSync('artifacts',{recursive:true});fs.writeFileSync('artifacts/performance-golden-electron.json',JSON.stringify(report,null,2)+'\n');tabs.dispose();host.destroy();clearTimeout(deadline);app.exit(0);
}).catch(e=>{console.error(e);clearTimeout(deadline);app.exit(1)});
