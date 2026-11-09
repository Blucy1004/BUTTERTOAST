const {app,BrowserWindow}=require('electron'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {createAiTask}=require('../../dist/browser/ai-task'),{WEB_PREFERENCES}=require('../../dist/security/electron');
app.enableSandbox();app.commandLine.appendSwitch('site-per-process');app.setPath('userData',fs.mkdtempSync(path.join(os.tmpdir(),'bt-blocked-renderer-')));
const deadline=setTimeout(()=>app.exit(2),18000);
app.whenReady().then(async()=>{
 const host=new BrowserWindow({show:false,width:1000,height:800,webPreferences:WEB_PREFERENCES}),task=createAiTask(),wc=task.view.webContents,c=task.controller;host.contentView.addChildView(task.view);task.view.setBounds({x:0,y:0,width:800,height:600});
 wc.session.protocol.handle('https',()=>new Response('<button onclick="while(true){}">Freeze renderer</button>',{headers:{'Content-Type':'text/html'}}));await wc.loadURL('https://blocked.test/');c.grant(new Set(['read','write','transmit','delete','pay']));const snap=await c.snapshot();
 const action={protocol:2,document:snap.document,id:'blocked-test',tab:snap.tab,origin:snap.origin,version:snap.version,op:'CLICK',target:snap.elements[0].id,value:''},approval=await c.requestApproval(action,async()=>true);assert.ok(approval);
 const at=performance.now();let result;const pending=c.execute(action,approval).then(value=>{result=value});await Promise.race([pending,new Promise(resolve=>setTimeout(resolve,6500))]);
 const report={id:'IR-TIMEOUT-01',elapsedMs:performance.now()-at,settled:!!result,result:result??null,versions:process.versions};fs.writeFileSync(process.env.BT_TORTURE_OUTPUT||'artifacts/torture/blocked-renderer.json',JSON.stringify(report,null,2));
 wc.forcefullyCrashRenderer();await task.close();host.destroy();clearTimeout(deadline);assert.ok(result,'Execution must settle within 6.5 seconds even if page handler never returns');assert.equal(result.ok,false);app.exit(0);
}).catch(error=>{console.error(error);clearTimeout(deadline);app.exit(1)});
