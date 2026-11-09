const {app,BrowserWindow,webContents,session}=require('electron'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const folder=process.env.BT_CRUST_PROFILE,mode=process.env.BT_CRUST_MODE;
if(app.isPackaged||!folder||!['prepare','restore'].includes(mode))throw Error('Isolated test entrypoint required');
app.setPath('userData',folder);const cipher=require('./torture/test-cipher.cjs').installTestCipher(folder);
const wait=ms=>new Promise(r=>setTimeout(r,ms));async function until(fn,label){for(let i=0;i<400;i++){if(await fn())return;await wait(20);}throw Error(label);}
app.on('session-created',ses=>{ses.protocol.handle('https',()=>new Response('<title>Restored fixture</title><p>CRUST RESTORE FIXTURE</p><input id="draft">',{headers:{'Content-Type':'text/html'}}));});
const deadline=setTimeout(()=>app.exit(1),35000);
require('../dist/main');
app.whenReady().then(async()=>{
 const main=BrowserWindow.getAllWindows()[0],ui=main.webContents;
 await until(()=>ui.executeJavaScript('!!window.browser&&!document.getElementById("new").disabled').catch(()=>false),'ready');
 await ui.executeJavaScript('window.state=null;browser.onState(s=>state=s);browser.command({type:"ready"})');await until(()=>ui.executeJavaScript('!!state'),'state');
 const state=()=>ui.executeJavaScript('state'),send=async(type,data={})=>{await ui.executeJavaScript(`browser.command(${JSON.stringify({type,...data})})`);await wait(100);};
 if(mode==='prepare'){
  await send('navigate',{address:'https://restore.test/one'});await until(async()=>!(await state()).loading,'one');const one=(await state()).active;
  await send('new');await send('navigate',{address:'https://restore.test/two'});await until(async()=>!(await state()).loading,'two');const two=(await state()).active;
  await send('new');await send('navigate',{address:'https://restore.test/three'});await until(async()=>!(await state()).loading,'three');const three=(await state()).active;
  await send('group-new',{id:one});const group=(await state()).groups[0];await send('tab-group',{id:two,group:group.id});await send('group-update',{id:group.id,name:'Restore group',color:'violet'});
  await send('split-tab',{id:one,side:'left'});await send('split-tab',{id:two,side:'right'});await send('split-resize',{ratio:.6});await send('tab-detach',{id:three});
  await until(()=>BrowserWindow.getAllWindows().length===2,'detached window');await send('toast-draft',{text:'PRIVATE_GOAL_NOT_PERSISTED',kind:'text'});
  await until(async()=>{try{const value=JSON.parse(await cipher.decrypt(fs.readFileSync(path.join(folder,'window-tabs-1.enc'))));return value.tabs[0].url==='https://restore.test/three';}catch{return false;}},'window checkpoint');
  console.log('PASS prepared encrypted grouped split tabs, detached window and draft using production main');
 }else{
  const current=await state();assert.equal(current.tabs.length,2);assert.equal(current.groups[0].name,'Restore group');assert.equal(current.split.ratio,.6);assert.equal(current.tabs.filter(t=>t.group===current.groups[0].id).length,2);
  await send('select',{id:current.active});await until(()=>webContents.getAllWebContents().filter(w=>w.session===session.fromPartition('persist:human')&&w.getURL().startsWith('https://restore.test/')&&!w.isLoading()).length===3,'three restored URLs');
  assert.ok(BrowserWindow.getAllWindows().some(w=>w!==main&&w.contentView.children.some(v=>v.webContents?.getURL()==='https://restore.test/three')));
  assert.equal(webContents.getAllWebContents().filter(w=>w.getURL()==='toast-ui://app/ai.html').length,0);
  assert.equal((await state()).home.tasks[0].status,'interrupted');assert.equal((await state()).home.tasks[0].reason,'restored');
  const metadata=await cipher.decrypt(fs.readFileSync(path.join(folder,'tasks.enc')));assert.doesNotMatch(metadata,/PRIVATE_GOAL_NOT_PERSISTED/);
  console.log('PASS fresh process restores group/split/detached URLs and interrupts history without reviving any AI view or authority');
 }
 clearTimeout(deadline);app.quit();
}).catch(e=>{console.error('FAIL',e);app.exit(1);});
