const {app,BrowserWindow,webContents,session}=require('electron'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {settings,fixture,until,run,wait}=require('./long-common.cjs'),config=settings(),snapshot=process.env.BT_TORTURE_BASELINE;
if(!snapshot||app.isPackaged)throw Error('Test snapshot required');
app.setPath('userData',fs.mkdtempSync(path.join(os.tmpdir(),'bt-torture-long-')));
const deadline=setTimeout(()=>app.exit(2),config.duration+180000);require(path.join(snapshot,'dist/main'));
app.whenReady().then(async()=>{
 const local=await fixture(),main=BrowserWindow.getAllWindows()[0],ui=main.webContents;main.setContentSize(1440,900);
 await until(async()=>!ui.isLoading()&&await ui.executeJavaScript('!document.getElementById("new").disabled'),'app ready');
 await ui.executeJavaScript('window.benchmarkState=null;browser.onState(s=>benchmarkState=s);browser.command({type:"ready"})');await until(()=>ui.executeJavaScript('!!benchmarkState'),'state');
 const send=async cmd=>{await wait(125);await ui.executeJavaScript(`browser.command(${JSON.stringify(cmd)})`);},state=()=>ui.executeJavaScript('benchmarkState'),ids=[];let crashCallback=()=>{};
 const watching=new WeakSet();const watch=wc=>{if(watching.has(wc))return;watching.add(wc);wc.on('render-process-gone',(_event,details)=>crashCallback(details.reason));};
 const contents=i=>{const wc=webContents.getAllWebContents().find(w=>w.session===session.fromPartition('persist:human')&&w.getURL().startsWith(new URL(local.url(i)).origin+'/'));if(!wc)throw Error('Page contents unavailable '+i);watch(wc);return wc;};
 const driver={name:'ButterToast full app',version:process.versions,source:JSON.parse(fs.readFileSync(path.join(snapshot,'source.json'))),pid:process.pid,policy:{memorySaver:config.scenario==='B',idleThresholdMs:900000,input:'trusted UI IPC; fixed JS page scroll',headless:!process.env.DISPLAY},onCrash(fn){crashCallback=fn;},
  async open(i){if(i)await send({type:'new'});await send({type:'navigate',address:local.url(i)});await until(async()=>{const s=await state();return s.url===local.url(i)&&!s.loading},'load '+i);ids.push((await state()).active);watch(contents(i));if(i===0){const viewport=await contents(i).executeJavaScript('[innerWidth,innerHeight]');if(viewport[0]!==742||viewport[1]!==686)throw Error('Unexpected viewport '+viewport);}},
  async select(i){await send({type:'select',id:ids[i]});},async ready(i){await until(async()=>{const s=await state();return s.active===ids[i]&&!s.loading&&s.url.startsWith(new URL(local.url(i)).origin+'/')},'restore '+i);},
  async navigate(i,page){await send({type:'navigate',address:local.url(i,page)});await this.ready(i);},async evaluate(i,code){return contents(i).executeJavaScript(code);},
  async memorySaver(enabled){if(!enabled)return;await send({type:'manager-open'});let manager;await until(()=>{manager=webContents.getAllWebContents().find(w=>w.getURL()==='toast-ui://app/manager.html');return manager&&!manager.isLoading()},'manager');await manager.executeJavaScript('window.manager.command({type:"settings",settings:{search:"google",theme:"off",history:false,restoreTabs:true,memorySaver:true}})');await wait(150);BrowserWindow.fromWebContents(manager).close();},
  async inspect(){const s=await state();return {logicalTabs:s.tabs.length,livePages:webContents.getAllWebContents().filter(w=>w.session===session.fromPartition('persist:human')).length,suspended:s.tabs.filter(t=>t.status==='suspended').length,unresponsive:s.tabs.filter(t=>t.status==='unresponsive').length};},
  async crashAndRecover(i){const original=contents(i);original.forcefullyCrashRenderer();await until(async()=>(await state()).status==='crashed','crash observed');await send({type:'restart'});await this.ready(i);if(contents(i)===original)throw Error('Old renderer reused');}
 };
 try{const report=await run(driver,config,process.env.BT_TORTURE_OUTPUT);console.log('COMPLETE',config.scenario,report.elapsedMs);clearTimeout(deadline);local.server.close();main.destroy();app.exit(report.ok?0:1);}catch(e){throw e;}
}).catch(e=>{console.error(e);clearTimeout(deadline);app.exit(1)});
