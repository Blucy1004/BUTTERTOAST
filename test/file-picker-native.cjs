// Optional Linux/X11 check of the real OS picker, not CDP file injection.
const {app,BrowserWindow,webContents}=require('electron');
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{execFile}=require('node:child_process'),{promisify}=require('node:util');
const {start,sha}=require('./fixtures/file-transfer-server.cjs'),run=promisify(execFile);
if(process.platform!=='linux'||!process.env.DISPLAY||app.isPackaged)throw Error('Requires Linux X11 test display and development source');
const profile=fs.mkdtempSync(path.join(os.tmpdir(),'bt-native-files-'));app.setPath('userData',profile);
const wait=ms=>new Promise(r=>setTimeout(r,ms));async function until(fn,label){for(let i=0;i<400;i++){if(await fn())return;await wait(25);}throw Error(label);}
const deadline=setTimeout(()=>app.exit(2),60000);let fixture;
require('../dist/main');
app.whenReady().then(async()=>{
 fixture=await start();const main=BrowserWindow.getAllWindows()[0],ui=main.webContents;main.setContentSize(1440,1000);main.show();main.focus();
 await until(async()=>!ui.isLoading()&&await ui.executeJavaScript('!document.getElementById("new").disabled'),'app ready');
 await ui.executeJavaScript(`browser.command({type:'navigate',address:${JSON.stringify(fixture.base)}})`);
 await until(()=>webContents.getAllWebContents().some(w=>w.getURL()===fixture.base+'/'&&!w.isLoading()),'upload page');
 const human=webContents.getAllWebContents().find(w=>w.getURL()===fixture.base+'/');
 const handle='0x'+main.getNativeWindowHandle().readUInt32LE(0).toString(16);
 async function click(selector){const point=await human.executeJavaScript(`(()=>{const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)}})()`);main.focus();human.focus();human.sendInputEvent({type:'mouseMove',...point});await wait(120);human.sendInputEvent({type:'mouseDown',button:'left',clickCount:1,...point});human.sendInputEvent({type:'mouseUp',button:'left',clickCount:1,...point});}
 const results=[];
 await click('#files');await run('python3',['test/fixtures/native-picker.py',handle,'--cancel'],{timeout:15000});await wait(200);
 assert.equal(await human.executeJavaScript('files.files.length'),0);assert.equal(fixture.uploads.length,0);results.push({name:'Real native picker cancellation sends no file',status:'pass'});
 const file=path.join(profile,'selected.txt'),bytes=Buffer.from('NATIVE_UPLOAD_FIXTURE');fs.writeFileSync(file,bytes);
 await click('#files');await run('python3',['test/fixtures/native-picker.py',handle,file],{timeout:15000});
 await until(()=>human.executeJavaScript('files.files.length===1'),'native file selected');assert.equal(await human.executeJavaScript('changes'),1);
 await click('#submit');await until(()=>fixture.uploads.length===1,'native upload received');assert.deepEqual(fixture.uploads[0],[{name:'selected.txt',size:bytes.length,sha256:sha(bytes)}]);results.push({name:'Real native picker + pointer submit sends exact HTTP multipart file',status:'pass'});
 fs.mkdirSync('artifacts/file-transfer',{recursive:true});fs.writeFileSync('artifacts/file-transfer/native-picker.json',JSON.stringify({generatedAtUtc:new Date().toISOString(),platform:process.platform,versions:process.versions,display:process.env.DISPLAY,OSPickerInteracted:true,CDPFileSelection:false,results},null,2)+'\n');
 console.log('PASS real OS picker cancellation and selected file HTTP upload');await fixture.close();clearTimeout(deadline);app.exit(0);
}).catch(async e=>{console.error(e);await fixture?.close();clearTimeout(deadline);app.exit(1);});
