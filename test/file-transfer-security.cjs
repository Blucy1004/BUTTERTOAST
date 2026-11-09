// Real Chromium downloads/HTTP uploads; native download consent and fixture file selection are automated.
const {app,BrowserWindow,webContents,dialog,Menu}=require('electron');
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {start,sha}=require('./fixtures/file-transfer-server.cjs');
const profile=fs.mkdtempSync(path.join(os.tmpdir(),'bt-files-'));app.setPath('userData',profile);
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(fn,label){for(let i=0;i<400;i++){if(await fn())return;await wait(25);}throw Error(label);}
const records=[];let fixture,main,originalMessage,originalSave,originalMenu;
const deadline=setTimeout(()=>{console.error('File transfer suite timeout');app.exit(2);},90000);
async function check(name,fn){await fn();records.push({name,status:'pass'});console.log('PASS',name);}
require('../dist/main');
app.whenReady().then(async()=>{
 fixture=await start();main=BrowserWindow.getAllWindows()[0];main.setContentSize(1440,1000);const ui=main.webContents;
 await until(async()=>!ui.isLoading()&&await ui.executeJavaScript('!document.getElementById("downloads-open").disabled'),'UI ready');
 await ui.executeJavaScript(`browser.command({type:'navigate',address:${JSON.stringify(fixture.base)}});document.getElementById('downloads-open').click()`);
 await until(()=>webContents.getAllWebContents().some(w=>w.getURL()===fixture.base+'/'),'human page');
 const human=webContents.getAllWebContents().find(w=>w.getURL()===fixture.base+'/');
 await until(()=>!human.isLoading(),'page loaded');
 await until(()=>webContents.getAllWebContents().some(w=>w.getURL()==='toast-ui://app/manager.html'&&!w.isLoading()),'downloads opened');
 const manager=webContents.getAllWebContents().find(w=>w.getURL()==='toast-ui://app/manager.html');
 await manager.executeJavaScript('window.fileState=null;manager.onState(s=>fileState=s);manager.command({type:"ready"})');
 const state=()=>manager.executeJavaScript('fileState'),send=command=>manager.executeJavaScript(`manager.command(${JSON.stringify(command)})`);
 await until(()=>state(),'download state');
 await check('download icon opens the correct panel and uses bundled SVG',async()=>{
  assert.equal(await manager.executeJavaScript('!document.getElementById("downloads").hidden'),true);
  assert.equal(await ui.executeJavaScript('document.querySelector("#downloads-open svg").dataset.iconName'),'download');
 });
 originalMessage=dialog.showMessageBoxSync;originalSave=dialog.showSaveDialogSync;originalMenu=Menu.buildFromTemplate;
 let answer=1,destination,confirmations=0;
 dialog.showMessageBoxSync=(_win,options)=>{confirmations++;assert.equal(options.defaultId,0);return answer;};
 dialog.showSaveDialogSync=()=>destination;
 const click=selector=>human.executeJavaScript(`document.querySelector(${JSON.stringify(selector)}).click()`,true);
 async function completed(name){await until(async()=>(await state()).downloads.some(d=>d.name===name&&d.state==='completed'),name+' completed');return (await state()).downloads.find(d=>d.name===name);}
 async function next(name){await wait(1550);destination=path.join(profile,name);answer=1;}
 await check('native rejection and destination cancellation write no file',async()=>{
  destination=path.join(profile,'denied.txt');answer=0;let denied=false;human.session.once('will-download',e=>{denied=e.defaultPrevented;});await click('#download');await until(()=>denied,'denied');assert.equal(fs.existsSync(destination),false);
  await next('cancelled.txt');const cancelled=destination;destination=undefined;denied=false;human.session.once('will-download',e=>{denied=e.defaultPrevented;});await click('#download');await until(()=>denied,'save cancelled');assert.equal(fs.existsSync(cancelled),false);
 });
 await check('HTTP download saves exact bytes, final size and a path-free UI state',async()=>{
  await next('http.txt');await click('#download');const entry=await completed('http.txt');assert.equal(fs.readFileSync(destination,'utf8'),'ButterToast HTTP fixture');assert.equal(entry.received,fs.statSync(destination).size);assert.equal(entry.total,entry.received);assert.equal('path' in entry,false);assert.equal('item' in entry,false);
  assert.equal(await manager.executeJavaScript('document.querySelector("#download-list progress").value'),entry.received);
 });
 await check('same-origin Blob export saves its actual UTF-8 payload',async()=>{
  await next('generated.txt');await click('#blob');const entry=await completed('generated.txt');assert.equal(fs.readFileSync(destination,'utf8'),'ButterToast export · 파일');assert.equal(entry.origin,fixture.base);assert.equal(entry.received,fs.statSync(destination).size);
 });
 let menuItems,menuClose;
 Menu.buildFromTemplate=items=>{menuItems=items;return {popup:options=>{menuClose=options.callback;}};};
 await check('native link/image menu saves inline resources and revokes a stale menu',async()=>{
  await next('inline.txt');human.emit('context-menu',{}, {linkURL:fixture.base+'/inline',srcURL:'',mediaType:'none',isEditable:false,selectionText:''});menuItems.find(i=>i.label==='링크를 다른 이름으로 저장').click();menuClose?.();await completed('inline.txt');assert.equal(fs.readFileSync(destination,'utf8'),'ButterToast HTTP fixture');
  await next('image.svg');human.emit('context-menu',{}, {linkURL:'',srcURL:fixture.base+'/image.svg',mediaType:'image',isEditable:false,selectionText:''});menuItems.find(i=>i.label==='이미지를 다른 이름으로 저장').click();menuClose?.();await completed('image.svg');assert.match(fs.readFileSync(destination,'utf8'),/^<svg/);
  human.emit('context-menu',{}, {linkURL:fixture.base+'/inline',srcURL:'',mediaType:'none',isEditable:false,selectionText:''});const selected=menuItems.find(i=>i.label==='링크를 다른 이름으로 저장'),before=confirmations;
  await human.loadURL(fixture.base+'/replaced');selected.click();menuClose?.();await wait(100);assert.equal(confirmations,before);
 });
 Menu.buildFromTemplate=originalMenu;
 await check('pause/resume completes actual slow transfer; cancellation never completes',async()=>{
  await next('slow.bin');await click('#slow');await until(async()=>(await state()).downloads.some(d=>d.name==='slow.bin'&&d.received>0),'download progress');const entry=(await state()).downloads.find(d=>d.name==='slow.bin');
  await send({type:'download',id:entry.id,action:'pause'});await until(async()=>(await state()).downloads.find(d=>d.id===entry.id)?.paused,'paused');await wait(150);
  assert.equal((await state()).downloads.find(d=>d.id===entry.id).state,'progressing');await send({type:'download',id:entry.id,action:'resume'});await completed('slow.bin');assert.equal(sha(fs.readFileSync(destination)),sha(fixture.bytes));
  await next('stop.bin');await click('#slow');await until(async()=>(await state()).downloads.some(d=>d.name==='stop.bin'),'cancellable');const stopped=(await state()).downloads.find(d=>d.name==='stop.bin');await send({type:'download',id:stopped.id,action:'cancel'});await until(async()=>(await state()).downloads.find(d=>d.id===stopped.id)?.state==='cancelled','cancelled');assert.equal((await state()).downloads.find(d=>d.id===stopped.id).canResume,false);
 });
 await check('AI task session cannot download a generated file',async()=>{
  const {createAiTask}=require('../dist/browser/ai-task');const task=createAiTask();try{const wc=task.view.webContents;await wc.loadURL(fixture.base+'/ai');let denied=false;wc.session.once('will-download',e=>{denied=e.defaultPrevented;});const before=confirmations;await wc.executeJavaScript('document.getElementById("blob").click()',true);await until(()=>denied,'AI download denied');assert.equal(confirmations,before);}finally{await task.close();}
 });
 await human.loadURL(fixture.base+'/upload-form');human.debugger.attach('1.3');await human.debugger.sendCommand('Page.enable');await human.debugger.sendCommand('Page.setInterceptFileChooserDialog',{enabled:true});
 let chooser;human.debugger.on('message',(_event,name,params)=>{if(name==='Page.fileChooserOpened')chooser=params;});
 const files=[path.join(profile,'first.txt'),path.join(profile,'두번째.bin')];fs.writeFileSync(files[0],'UPLOAD_FIXTURE_ONE');fs.writeFileSync(files[1],Buffer.from([0,1,255,128,10,13]));
 async function choose(paths){chooser=null;await click('#files');await until(()=>chooser,'Chromium file chooser');await human.debugger.sendCommand('DOM.setFileInputFiles',{backendNodeId:chooser.backendNodeId,files:paths});}
 await check('webpage cannot assign a local path and cancelled selection sends nothing',async()=>{
  assert.equal(await human.executeJavaScript('(()=>{try{files.value="C:\\\\private\\\\secret.txt";return false}catch(e){return e.name==="InvalidStateError"}})()'),true);
  await choose([]);assert.equal(await human.executeJavaScript('files.files.length'),0);assert.equal(fixture.uploads.length,0);assert.deepEqual(await human.executeJavaScript('[typeof require,typeof browser,typeof manager]'),['undefined','undefined','undefined']);
 });
 await check('multiple selected files upload byte-for-byte through actual HTTP multipart',async()=>{
  await choose(files);assert.equal(chooser.mode,'selectMultiple');assert.equal(await human.executeJavaScript('files.files.length'),2);assert.equal(await human.executeJavaScript('changes'),1);
  assert.equal((await human.executeJavaScript('files.value')).includes(profile),false);
  await click('#submit');await until(()=>fixture.uploads.length===1,'multipart received');assert.deepEqual(fixture.uploads[0],files.map(file=>({name:path.basename(file),size:fs.statSync(file).size,sha256:sha(fs.readFileSync(file))})));
 });
 await check('native drag payload reaches site upload handler without local-file navigation',async()=>{
  await human.loadURL(fixture.base+'/drop');assert.equal(await human.executeJavaScript('files.files.length'),0);
  const point=await human.executeJavaScript('(()=>{const r=document.getElementById("drop").getBoundingClientRect();return {x:r.x+20,y:r.y+20}})()');
  for(const type of ['dragEnter','dragOver','drop'])await human.debugger.sendCommand('Input.dispatchDragEvent',{type,...point,data:{items:[],files:[files[0]],dragOperationsMask:1}});
  await until(()=>fixture.uploads.length===2,'drop upload received');assert.equal(fixture.uploads[1][0].sha256,sha(fs.readFileSync(files[0])));assert.equal(human.getURL(),fixture.base+'/drop');
 });
 await check('selected file paths and bytes are absent from ToastIR and file fields cannot be filled by AI',async()=>{
  const {ToastController}=require('../dist/toastir/controller');const c=new ToastController(human);
  assert.throws(()=>c.grant(new Set(['read'])),/Invalid scope/);
  human.session.protocol.handle('https',()=>new Response(require('./fixtures/file-transfer-server.cjs').page,{headers:{'Content-Type':'text/html'}}));
  await human.loadURL('https://upload-private.test/');await choose(files);c.grant(new Set(['read','write','transmit','delete','pay']));
  const snap=await c.snapshot(),serialized=JSON.stringify(snap);assert.equal(serialized.includes(profile),false);assert.equal(serialized.includes('UPLOAD_FIXTURE_ONE'),false);assert.equal(serialized.includes('first.txt'),false);
  const field=snap.elements.find(e=>e.sensitive&&e.role==='textbox');assert.ok(field);assert.equal(field.name,'[private]');assert.deepEqual(field.actions,[]);
  const action={protocol:2,id:'blocked-file-fill',tab:snap.tab,origin:snap.origin,document:snap.document,version:snap.version,op:'FILL',target:field.id,value:files[0]};
  const approval=await c.requestApproval(action,async()=>true);assert.equal(approval,null);assert.equal((await c.execute(action)).ok,false);assert.equal(await human.executeJavaScript('files.files.length'),2);c.dispose();
 });
 human.debugger.detach();
 await check('file URL entered directly in a new blank human tab can be saved',async()=>{
  await next('address.txt');await ui.executeJavaScript('browser.command({type:"new"})');
  await ui.executeJavaScript(`browser.command({type:'navigate',address:${JSON.stringify(fixture.base+'/attachment')}})`);
  await completed('address.txt');assert.equal(fs.readFileSync(destination,'utf8'),'ButterToast HTTP fixture');
 });
 await check('additional human window exposes the same downloads shortcut',async()=>{
  await ui.executeJavaScript('document.getElementById("new-window").click()');await until(()=>webContents.getAllWebContents().some(w=>w.getURL()==='toast-ui://app/browse.html'&&!w.isLoading()),'new window');const extra=webContents.getAllWebContents().find(w=>w.getURL()==='toast-ui://app/browse.html');await manager.executeJavaScript('document.querySelector("[data-section=bookmarks]").click()');await extra.executeJavaScript('document.getElementById("downloads-open").click()');await until(()=>manager.executeJavaScript('!document.getElementById("downloads").hidden'),'new window downloads');
 });
 fs.mkdirSync('artifacts/file-transfer',{recursive:true});fs.writeFileSync('artifacts/file-transfer/results.json',JSON.stringify({generatedAtUtc:new Date().toISOString(),platform:process.platform,versions:process.versions,records,realHttp:true,nativeDownloadDialogs:'automated decisions',fileSelection:'CDP fixture selection; OS picker tested separately',externalSitesTested:false},null,2)+'\n');
 console.log(`File transfer: ${records.length} groups passed`);dialog.showMessageBoxSync=originalMessage;dialog.showSaveDialogSync=originalSave;await fixture.close();clearTimeout(deadline);app.exit(0);
}).catch(async e=>{console.error(e);if(originalMenu)Menu.buildFromTemplate=originalMenu;await fixture?.close();clearTimeout(deadline);app.exit(1);});
