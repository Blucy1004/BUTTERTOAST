// Production browser + local HTTPS protocol fixtures. No live models, keys or public attacks.
const {app,BrowserWindow,webContents,session,dialog,Menu}=require('electron');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),assert=require('node:assert/strict');
const {EventEmitter}=require('node:events');
const profile=fs.mkdtempSync(path.join(os.tmpdir(),'bt-upgrade-'));app.setPath('userData',profile);
const wait=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn,label){for(let i=0;i<400;i++){if(await fn())return;await wait(20)}throw Error(label)}
let groups=0;const pass=s=>{groups++;console.log('PASS',s)};
const deadline=setTimeout(()=>{console.error('FAIL upgrade timeout');app.exit(1)},110000);
const fixture='<html><head><title>Upgrade fixture</title></head><body><h1>NEEDLE</h1><p>NEEDLE and NEEDLE</p><input id="draft"><button id="act" onclick="clicked++">Approve action</button><script>window.clicked=0</script></body></html>';
require('../dist/main');
app.whenReady().then(async()=>{
 const main=BrowserWindow.getAllWindows()[0],ui=main.webContents;main.setContentSize(1440,900);
 await until(async()=>!ui.isLoading()&&await ui.executeJavaScript('!document.getElementById("new").disabled'),'UI ready');
 await ui.executeJavaScript('window.states=[];window.browser.onState(s=>states.push(s));window.browser.command({type:"ready"})');
 await until(()=>ui.executeJavaScript('states.length>0'),'shell state');
 const shell=()=>ui.executeJavaScript('states.at(-1)');
 const send=command=>ui.executeJavaScript(`window.browser.command(${JSON.stringify(command)})`);
 const human=webContents.getAllWebContents().find(w=>w.session===session.fromPartition('persist:human'));
 const requests=[];human.session.protocol.handle('https',request=>{requests.push({url:request.url,method:request.method});return new Response(fixture,{headers:{'Content-Type':'text/html'}})});
 await ui.executeJavaScript('document.fonts.load("14px Pretendard")');
 assert.equal(await ui.executeJavaScript('Array.from(document.fonts).some(f=>f.family==="Pretendard"&&f.status==="loaded")'),true);
 assert.equal(await ui.executeJavaScript('document.querySelector(".brand").textContent'),'ButterToast');
 assert.equal(await ui.executeJavaScript('fetch("https://fonts.example.test/font.woff2").then(()=>true,()=>false)'),false);
 await wait(150);fs.mkdirSync('artifacts',{recursive:true});fs.writeFileSync('artifacts/upgrade-workspace.png',(await ui.capturePage()).toPNG());
 pass('bundled Pretendard loads offline through a fixed route; removed tagline stays absent and external fonts stay blocked');

 await human.loadURL('https://upgrade.test/page');await human.executeJavaScript('document.getElementById("draft").value="KEEP_ORIGINAL"');
 const first=(await shell()).active;let menuItems;
 const originalMenu=Menu.buildFromTemplate;Menu.buildFromTemplate=items=>{menuItems=items;return {popup(){}}};
 async function menu(id,label){menuItems=null;await send({type:'tab-menu',id});await until(()=>!!menuItems,'native menu');const item=menuItems.find(i=>i.label===label);assert.ok(item,label);item.click();await wait(60);}
 await menu(first,'탭 고정');assert.equal((await shell()).tabs[0].pinned,true);
 await menu(first,'탭 음소거');assert.equal(human.isAudioMuted(),true);
 await menu(first,'탭 복제 (주소만)');
 let duplicate;
 await until(async()=>{
   duplicate=webContents.getAllWebContents().find(w=>w!==human&&w.session===human.session&&w.getURL()==='https://upgrade.test/page');
   return (await shell()).tabs.length===2&&duplicate&&!duplicate.isLoading()&&await duplicate.executeJavaScript('document.readyState==="complete"&&!!document.getElementById("draft")');
 },'duplicate page commits and finishes loading');
 assert.ok(duplicate);assert.equal(await human.executeJavaScript('document.getElementById("draft").value'),'KEEP_ORIGINAL');assert.equal(await duplicate.executeJavaScript('document.getElementById("draft").value'),'');assert.equal(duplicate.isAudioMuted(),true);
 assert.equal(requests.at(-1).method,'GET');assert.equal((await shell()).tabs[1].pinned,false);
 await send({type:'move',id:(await shell()).active,delta:-1});await wait(50);assert.equal((await shell()).tabs[0].id,first);
 await ui.executeJavaScript('document.getElementById("tab-search").value="NO_SUCH_TAB";document.getElementById("tab-search").dispatchEvent(new Event("input"))');assert.equal(await ui.executeJavaScript('document.querySelectorAll("#tabs .tab").length'),0);
 await ui.executeJavaScript('document.getElementById("tab-search").value="upgrade.test";document.getElementById("tab-search").dispatchEvent(new Event("input"))');assert.equal(await ui.executeJavaScript('document.querySelectorAll("#tabs .tab").length'),2);
 await ui.executeJavaScript('document.getElementById("tab-search").value="";document.getElementById("tab-search").dispatchEvent(new Event("input"))');
 pass('production tab menu pins/mutes/duplicates without copying forms; pinned ordering and title/site search work');

 await send({type:'find-open'});await until(async()=>(await shell()).find.open,'find open');
 await send({type:'find',text:'NEEDLE',forward:true,next:false});await until(async()=>(await shell()).find.matches===3,'native page matches');
 const before=(await shell()).find.active;await send({type:'find',text:'NEEDLE',forward:true,next:true});await until(async()=>(await shell()).find.active!==before,'next match');
 const bounds=main.contentView.children.find(v=>v.webContents===duplicate).getBounds();assert.deepEqual(bounds,(await shell()).layout.human);
 const contentY=await ui.executeJavaScript('document.querySelector(".browser-empty").getBoundingClientRect().y');assert.equal(contentY,bounds.y);
 await send({type:'zoom',direction:1});await until(async()=>(await shell()).zoom===110,'zoom 110');await send({type:'zoom',direction:0});
 await send({type:'select',id:first});await until(async()=>!(await shell()).find.open,'tab change cancels find');
 assert.deepEqual(await human.executeJavaScript('[typeof browser,typeof require]'),['undefined','undefined']);
 pass('native find and zoom target only the active human page; viewport matches UI and tab switch drops old find results');

 const originalDialog=dialog.showMessageBox;let approvals=0;
 dialog.showMessageBox=async(_w,o)=>{approvals++;assert.equal(o.defaultId,0);return {response:0}};
 await menu(first,'다른 탭 닫기 (고정 탭 유지)');assert.equal((await shell()).tabs.length,2);assert.equal(approvals,1);
 dialog.showMessageBox=async()=>({response:1});await menu(first,'다른 탭 닫기 (고정 탭 유지)');await until(async()=>(await shell()).tabs.length===1,'confirmed close');assert.equal(human.isDestroyed(),false);
 await send({type:'reopen'});await until(async()=>(await shell()).tabs.length===2,'reopen');assert.equal((await shell()).tabs.at(-1).muted,true);
 await send({type:'select',id:first});Menu.buildFromTemplate=originalMenu;
 pass('bulk close requires native consent and preserves pinned tabs; reopening retains mute state');

 const {DownloadManager}=require('../dist/browser/downloads');
 const download=new DownloadManager(main,()=>human,()=>{});
 const originalMessage=dialog.showMessageBoxSync,originalSave=dialog.showSaveDialogSync;
 const item=new EventEmitter();let assigned=false,prevented=false;
 Object.assign(item,{getURLChain:()=>['https://download.test/file'],getURL:()=> 'https://download.test/file',getFilename:()=> 'sample.txt',getTotalBytes:()=>10,setSavePath:()=>{assigned=true}});
 dialog.showMessageBoxSync=()=>1;dialog.showSaveDialogSync=()=>{human.emit('did-start-navigation',{isMainFrame:true,url:human.getURL()});return path.join(profile,'must-not-save.txt')};
 download.accept({preventDefault(){prevented=true}},item,human);assert.equal(prevented,true);assert.equal(assigned,false);assert.equal(fs.existsSync(path.join(profile,'must-not-save.txt')),false);
 download.dispose();dialog.showMessageBoxSync=originalMessage;dialog.showSaveDialogSync=originalSave;
 pass('same-URL navigation during a download destination prompt revokes consent before any save path is assigned');

 app.on('session-created',ses=>{if(ses!==session.fromPartition('persist:human'))ses.protocol.handle('https',()=>new Response(fixture,{headers:{'Content-Type':'text/html'}}))});
 await wait(600);await send({type:'delegate',id:first});
 await until(()=>webContents.getAllWebContents().some(w=>w.getURL()==='toast-ui://app/ai.html'),'AI slot one');
 const ai1=webContents.getAllWebContents().find(w=>w.getURL()==='toast-ui://app/ai.html');
 await until(()=>!ai1.isLoading(),'AI ready');
 const aisend=(wc,command)=>wc.executeJavaScript(`window.ai.command(${JSON.stringify(command)})`);
 async function observe(wc){await wc.executeJavaScript('window.states=[];window.ai.onState(s=>states.push(s));window.ai.command({type:"ready"})');await until(()=>wc.executeJavaScript('states.length>0&&!states.at(-1).busy'),'AI state')}
 await observe(ai1);const aistate=wc=>wc.executeJavaScript('states.at(-1)');
 const pending=[];let callCount=0,replyMode='deferred';
 async function respond(request){if(request.method==='GET')return Response.json({data:[{id:'gpt-fixture'}]});callCount++;const body=await request.json();
   if(replyMode==='deferred')await new Promise(resolve=>pending.push(resolve));
   const context=JSON.parse(body.messages.at(-1).content).untrusted_page_context;
   return Response.json({choices:[{message:{content:JSON.stringify({reply:'fixture reply',action:replyMode==='action'?{op:'CLICK',target:context.elements.find(e=>e.actions.includes('CLICK')).id,value:''}:null})}}],usage:{prompt_tokens:10,completion_tokens:4}});
 }
 async function connect(wc,partition){const net=session.fromPartition(partition);try{net.protocol.unhandle('https')}catch{}net.protocol.handle('https',respond);await aisend(wc,{type:'connect',provider:'openai',endpoint:'https://api.openai.com/v1',key:'fixture-key-not-real',remember:false});await until(async()=>(await aistate(wc)).connected,'model connected');}
 await connect(ai1,'toast-model-network');await aisend(ai1,{type:'send',text:'deferred one'});await until(()=>pending.length===1,'first request');
 await send({type:'ai-next'});await until(()=>webContents.getAllWebContents().filter(w=>w.getURL()==='toast-ui://app/ai.html').length===2,'AI slot two');
 const ai2=webContents.getAllWebContents().find(w=>w.getURL()==='toast-ui://app/ai.html'&&w!==ai1);await until(()=>!ai2.isLoading(),'second UI');await observe(ai2);await connect(ai2,'toast-model-network-2');
 await aisend(ai2,{type:'send',text:'deferred two'});await until(()=>pending.length===2,'second request');
 await ui.executeJavaScript('for(let i=0;i<100;i++)window.browser.command({type:"invalid"});window.browser.command({type:"ai-stop-all",approved:true})');await wait(80);assert.equal((await aistate(ai1)).busy,true);assert.equal((await aistate(ai2)).busy,true);
 await send({type:'ai-stop-all'});await until(async()=>!(await aistate(ai1)).busy&&!(await aistate(ai2)).busy,'emergency stops both slots');
 for(const resolve of pending.splice(0))resolve();await wait(100);assert.equal((await aistate(ai1)).messages.some(m=>m.role==='assistant'),false);assert.equal((await aistate(ai2)).messages.some(m=>m.role==='assistant'),false);
 pass('global stop bypasses exhausted normal quotas, revokes hidden and visible slots, and discards both late model responses');

 await wait(3200);let resolveDelegation;
 dialog.showMessageBox=(_w,o)=>new Promise(resolve=>{assert.equal(o.title,'Toast에 보내기');resolveDelegation=resolve});
 const taskCount=()=>webContents.getAllWebContents().filter(w=>w.getURL()==='https://upgrade.test/page').length;
 const countBefore=taskCount();await send({type:'delegate',id:first});await until(()=>!!resolveDelegation,'pending delegation');
 ui.focus();ui.sendInputEvent({type:'keyDown',keyCode:'X',modifiers:[process.platform==='darwin'?'meta':'control','shift']});ui.sendInputEvent({type:'keyUp',keyCode:'X',modifiers:[process.platform==='darwin'?'meta':'control','shift']});await wait(60);
 resolveDelegation({response:1});await wait(150);assert.equal(taskCount(),countBefore);
 pass('native emergency shortcut invalidates a pending delegation so a late confirmation cannot start another task');

 dialog.showMessageBox=async()=>({response:1});await aisend(ai2,{type:'task-open',url:'https://upgrade.test/task'});await until(async()=>(await aistate(ai2)).display.status==='ready'&&!(await aistate(ai2)).busy,'task two ready');
 const task=webContents.getAllWebContents().find(w=>w.getURL()==='https://upgrade.test/task');replyMode='action';
 await aisend(ai2,{type:'share',source:'task'});await until(async()=>!!(await aistate(ai2)).context,'task context');await aisend(ai2,{type:'send',text:'propose action'});await until(async()=>!!(await aistate(ai2)).proposal,'action proposal');
 let resolveAction;dialog.showMessageBox=(_w,o)=>new Promise(resolve=>{assert.match(o.title,/동작 확인/);resolveAction=resolve});
 await aisend(ai2,{type:'approve'});await until(()=>!!resolveAction,'pending action');
 await ai2.executeJavaScript('for(let i=0;i<100;i++)window.ai.command({type:"invalid"});window.ai.command({type:"stop"})');await until(async()=>!(await aistate(ai2)).busy,'panel stop bypasses quota');resolveAction({response:1});await wait(100);assert.equal(await task.executeJavaScript('clicked'),0);
 pass('panel stop remains available under IPC flooding; approving a previously open native dialog cannot execute after revocation');

 await wait(3100);await task.session.cookies.set({url:'https://upgrade.test',name:'recovery-only',value:'MUST_NOT_RESTORE'});const previousSession=task.session,beforeRecoveryCalls=callCount;
 task.forcefullyCrashRenderer();await until(async()=>(await aistate(ai2)).display.status==='crashed','task crash');assert.equal(await human.executeJavaScript('1+1'),2);assert.equal((await aistate(ai2)).proposal,null);
 dialog.showMessageBox=async()=>({response:0});await aisend(ai2,{type:'task-recover'});await wait(80);assert.equal(task.isDestroyed(),false);
 dialog.showMessageBox=async()=>({response:1});await aisend(ai2,{type:'task-recover'});await until(()=>task.isDestroyed(),'old task destroyed');
 await until(async()=>(await aistate(ai2)).display.status==='ready'&&!(await aistate(ai2)).busy,'new recovery task');
 const recovered=webContents.getAllWebContents().find(w=>w.getURL()==='https://upgrade.test/task');assert.notEqual(recovered.session,previousSession);assert.equal((await recovered.session.cookies.get({name:'recovery-only'})).length,0);assert.equal(await recovered.executeJavaScript('clicked'),0);assert.equal(callCount,beforeRecoveryCalls);
 pass('crashed AI task requires recovery consent, uses a fresh isolated session, and replays no model request, action, cookie or form');
 dialog.showMessageBox=originalDialog;clearTimeout(deadline);console.log(`Upgrade security groups: ${groups} passed`);app.exit(0);
}).catch(error=>{console.error('FAIL',error);clearTimeout(deadline);app.exit(1)});
