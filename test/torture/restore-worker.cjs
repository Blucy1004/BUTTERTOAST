const {app,BrowserWindow,webContents,session}=require('electron'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {until,wait}=require('./long-common.cjs'),{installTestCipher}=require('./test-cipher.cjs');
const folder=process.env.BT_TORTURE_PROFILE,mode=process.env.BT_TORTURE_RESTORE_MODE,origin=process.env.BT_TORTURE_FIXTURE;
if(app.isPackaged||!folder||!origin?.startsWith('http://127.0.0.1:'))throw Error('Isolated test profile and local fixture required');
app.setPath('userData',folder);const cipher=installTestCipher(folder),started=performance.now();
require('../../dist/main');
app.whenReady().then(async()=>{
 const main=BrowserWindow.getAllWindows()[0],ui=main.webContents;await until(async()=>!ui.isLoading()&&await ui.executeJavaScript('!document.getElementById("new").disabled'),'ready');
 await ui.executeJavaScript('window.restoreState=null;browser.onState(s=>restoreState=s);browser.command({type:"ready"})');await until(()=>ui.executeJavaScript('!!restoreState'),'state');
 const state=()=>ui.executeJavaScript('restoreState'),send=async cmd=>{await wait(125);await ui.executeJavaScript(`browser.command(${JSON.stringify(cmd)})`);await wait(50);};
 const expected=Array.from({length:10},(_,i)=>`${origin}/restore/${i}`);
 if(mode==='prepare'){
  for(let i=0;i<10;i++){if(i)await send({type:'new'});await send({type:'navigate',address:expected[i]});await until(async()=>(await state()).url===expected[i]&&!(await state()).loading,'navigate');}
  await until(async()=>{try{const value=JSON.parse(await cipher.decrypt(fs.readFileSync(path.join(folder,'tabs.enc'))));return value.tabs.length===10&&value.tabs.every((t,i)=>t.url===expected[i]);}catch{return false}},'checkpoint');
  assert.ok(!fs.readFileSync(path.join(folder,'tabs.enc')).includes(Buffer.from(expected[0])));
  fs.writeFileSync(path.join(folder,'prepared.json'),JSON.stringify({pid:process.pid,urls:expected,elapsedMs:performance.now()-started,checkpoint:true}));
 }else{
  const restored=(await state()).tabs,urls=[];assert.equal(restored.length,10);
  for(const tab of restored){await send({type:'select',id:tab.id});await until(async()=>(await state()).active===tab.id&&!(await state()).loading,'restore selection');const url=(await state()).url;urls.push(url);const wc=webContents.getAllWebContents().find(w=>w.session===session.fromPartition('persist:human')&&w.getURL()===url);assert.ok(wc);assert.match(await wc.executeJavaScript('document.body.textContent'),/RESTORE FIXTURE/);}
  assert.deepEqual(urls,expected);fs.writeFileSync(path.join(folder,'restored.json'),JSON.stringify({pid:process.pid,urls,elapsedMs:performance.now()-started,scope:'actual SIGKILL/restart of production main; test AES-GCM cipher, not OS keychain/DPAPI',versions:process.versions}));main.destroy();app.exit(0);
 }
}).catch(error=>{console.error(error);app.exit(1)});
