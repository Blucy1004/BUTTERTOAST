// Opt-in read-only public-site smoke. Never enters credentials or submits forms.
const {app,BrowserWindow,session,webContents}=require('electron'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
app.setPath('userData',fs.mkdtempSync(path.join(os.tmpdir(),'bt-public-smoke-')));
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(fn,label){for(let i=0;i<500;i++){if(await fn())return;await wait(20)}throw Error(label)}
const deadline=setTimeout(()=>{console.error('Public-site smoke timed out');app.exit(1)},180000);
require('../dist/main');
app.whenReady().then(async()=>{
 const main=BrowserWindow.getAllWindows()[0],ui=main.webContents;await until(async()=>!ui.isLoading()&&await ui.executeJavaScript('!document.getElementById("new").disabled'),'app ready');
 const browsing=session.fromPartition('persist:human');if(process.env.HTTPS_PROXY)await browsing.setProxy({proxyRules:process.env.HTTPS_PROXY});
 const wc=webContents.getAllWebContents().find(w=>w.session===browsing),results=[];
 for(const url of ['https://www.google.com/','https://www.youtube.com/','https://github.com/','https://www.wikipedia.org/','https://docs.google.com/','https://drive.google.com/','https://mail.google.com/']){
  let status=null;const observe=(_event,_url,code)=>{status=code;};wc.on('did-navigate',observe);const started=Date.now();
  try{
   await Promise.race([wc.loadURL(url),new Promise((_,reject)=>setTimeout(()=>reject(Error('load-timeout')),20000))]);await wait(500);
   const page=await Promise.race([wc.executeJavaScript('({title:document.title,ready:document.readyState,textCharacters:document.body?.innerText.length||0,bridges:[typeof require,typeof browser,typeof ai]})'),new Promise((_,reject)=>setTimeout(()=>reject(Error('renderer-timeout')),3000))]);
   results.push({requested:url,finalOrigin:new URL(wc.getURL()).origin,httpStatus:status,elapsedMs:Date.now()-started,...page,outcome:status>=200&&status<400&&page.textCharacters>0?'document-loaded':'inspect-response'});
  }catch(error){wc.stop();results.push({requested:url,httpStatus:status,elapsedMs:Date.now()-started,outcome:'not-verified',reason:typeof error.code==='string'?error.code:error.message==='load-timeout'||error.message==='renderer-timeout'?error.message:'navigation-failed'});}
  finally{wc.removeListener('did-navigate',observe);}
  console.log('SMOKE',url,results.at(-1).outcome);
 }
 fs.mkdirSync('artifacts',{recursive:true});fs.writeFileSync('artifacts/public-site-smoke-golden.json',JSON.stringify({version:require('../package.json').version,scope:'Public landing-page rendering only; no login, video playback, editing or submission',results,generatedAt:new Date().toISOString()},null,2)+'\n');
 clearTimeout(deadline);main.destroy();app.exit(0);
}).catch(error=>{console.error(error);clearTimeout(deadline);app.exit(1)});
