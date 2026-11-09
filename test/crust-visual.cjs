// Real production UI with local page fixtures; no image generation or external requests.
const {app,BrowserWindow,webContents,session}=require('electron'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process');
const profile=fs.mkdtempSync(path.join(os.tmpdir(),'bt-crust-visual-'));app.setPath('userData',profile);require('./torture/test-cipher.cjs').installTestCipher(profile);
const wait=ms=>new Promise(r=>setTimeout(r,ms));async function until(fn,label){for(let i=0;i<350;i++){if(await fn())return;await wait(20);}throw Error(label);}
require('../dist/main');
app.whenReady().then(async()=>{
 const main=BrowserWindow.getAllWindows()[0],ui=main.webContents;main.setContentSize(1500,950);
 await until(()=>ui.executeJavaScript('!!window.browser&&!document.getElementById("new").disabled').catch(()=>false),'ready');
 await ui.executeJavaScript('window.state=null;browser.onState(s=>state=s);browser.command({type:"ready"})');await until(()=>ui.executeJavaScript('!!state'),'state');
 const capture=file=>{if(process.platform!=='linux'||!process.env.DISPLAY)throw Error('X11 composite screenshot needs DISPLAY');execFileSync('import',['-window',String(main.getNativeWindowHandle().readUInt32LE(0)),file]);};
 const state=()=>ui.executeJavaScript('state'),send=async(type,data={})=>{await ui.executeJavaScript(`browser.command(${JSON.stringify({type,...data})})`);await wait(120);};
 session.fromPartition('persist:human').protocol.handle('https',request=>new Response(`<!doctype html><html lang="ko"><meta charset="utf-8"><title>${new URL(request.url).pathname==='/notes'?'Research notes':'Reading list'}</title><style>body{margin:0;padding:28px;background:#f6f7f9;color:#24334a;font:16px sans-serif;line-height:1.8}h1{font-size:28px}p{max-width:34em}input{padding:12px;width:80%}button{padding:10px;margin-top:18px}</style><h1>${new URL(request.url).pathname==='/notes'?'Research notes':'Reading list'}</h1><p>ButterToast 로컬 검증 페이지입니다. 두 페이지를 나란히 보면서 메모를 남기고 Toast 작업을 준비할 수 있습니다.</p><input aria-label="메모" placeholder="저장 전 메모"><p>페이지 내용과 로그인은 사용자가 승인하기 전까지 AI에 전달되지 않습니다.</p><button>자료 확인</button></html>`,{headers:{'Content-Type':'text/html'}}));
 await send('navigate',{address:'https://crust.test/notes'});await until(async()=>!(await state()).loading,'notes');const first=(await state()).active;await send('bookmark');
 await send('new');await send('navigate',{address:'https://crust.test/reading'});await until(async()=>!(await state()).loading,'reading');await send('bookmark');
 await send('group-new',{id:first});const group=(await state()).groups[0];await send('group-update',{id:group.id,name:'Research',color:'teal'});
 await send('toast-draft',{kind:'text',text:'두 자료의 내용을 비교하고 주요 차이를 정리해 줘.'});
 const ai=webContents.getAllWebContents().find(w=>w.getURL()==='toast-ui://app/ai.html');await until(()=>ai&&!ai.isLoading(),'AI draft');
 await ai.executeJavaScript('ai.command({type:"task-display",mode:"status"})');
 await send('new');if(await ui.executeJavaScript('document.documentElement.dataset.theme')!=='light')await send('theme-cycle');await wait(400);
 fs.mkdirSync('artifacts/crust',{recursive:true});capture('artifacts/crust/light-newtab.png');
 await send('select',{id:first});await send('split-tab',{id:first,side:'left'});await send('theme-cycle');await wait(400);
 capture('artifacts/crust/dark-split.png');
 await send('command-open');await send('command-query',{query:'Research'});await wait(200);capture('artifacts/crust/command-bar.png');await send('command-close');
 const report=[];
 for(const width of [1500,1080,760,600]){main.setContentSize(width,800);await wait(200);const metrics=await ui.executeJavaScript('({width:innerWidth,overflow:document.documentElement.scrollWidth>innerWidth,small:parseFloat(getComputedStyle(document.getElementById("app-version")).fontSize),theme:document.documentElement.dataset.theme})');assert.equal(metrics.overflow,false);assert.ok(metrics.small>=12);report.push(metrics);}
 fs.writeFileSync('artifacts/crust/visual.json',JSON.stringify({platform:process.platform,scope:'X11 composite captures of actual Electron window and child views; test-cipher and local fixtures only',sizes:report},null,2)+'\n');console.log('PASS actual UI captures and responsive overflow/font checks at four sizes');app.quit();
}).catch(e=>{console.error(e);app.exit(1);});
