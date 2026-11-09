// Optional public HTTPS smoke: downloads only this repository's immutable README.
const root=require('node:path').resolve(__dirname,'..');
const {app,BrowserWindow,webContents,dialog}=require('electron');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),assert=require('node:assert/strict'),{createHash}=require('node:crypto');
const folder=fs.mkdtempSync(path.join(os.tmpdir(),'bt-online-file-'));app.setPath('userData',folder);
const url='https://raw.githubusercontent.com/Blucy1004/BUTTERTOAST/7b96ec967f5bd4e0b1f37ccc7182877d2a159193/README.md';
const deadline=setTimeout(()=>{console.error('Online download timed out');app.exit(2);},45000);
const wait=ms=>new Promise(r=>setTimeout(r,ms));
require(root+'/dist/main');
app.whenReady().then(async()=>{
 const win=BrowserWindow.getAllWindows()[0];let human;
 for(let i=0;i<200;i++){human=webContents.getAllWebContents().find(w=>w.session!==win.webContents.session);if(human)break;await wait(25);}
 assert.ok(human);await human.loadURL(url);
 const output=path.join(folder,'README.md');dialog.showMessageBoxSync=()=>1;dialog.showSaveDialogSync=()=>output;
 const complete=new Promise((resolve,reject)=>human.session.once('will-download',(event,item)=>{
  if(event.defaultPrevented){reject(Error('Download denied'));return;}
  item.once('done',(_event,state)=>state==='completed'?resolve():reject(Error(state)));
 }));
 human.downloadURL(url);await complete;const bytes=fs.readFileSync(output);assert.equal(createHash('sha256').update(bytes).digest('hex'),'08964026e4869eb8f6f56c0f04065a9ca0a99102c86aa8015a189578e99c1939');
 const result={generatedAtUtc:new Date().toISOString(),url,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),realInternetDownload:true,expectedSourceCommit:'7b96ec967f5bd4e0b1f37ccc7182877d2a159193',TLSVerificationDisabled:false,publicReadOnly:true,status:'pass'};
 fs.mkdirSync(root+'/artifacts/file-transfer',{recursive:true});fs.writeFileSync(root+'/artifacts/file-transfer/online-download.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));clearTimeout(deadline);app.exit(0);
}).catch(e=>{console.error(e.message);clearTimeout(deadline);app.exit(1);});
