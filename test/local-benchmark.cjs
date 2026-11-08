const {app,BrowserWindow,session}=require('electron');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{performance}=require('node:perf_hooks');
const {ToastController}=require('../dist/toastir/controller'),{WEB_PREFERENCES,hardenSession,hardenWebContents}=require('../dist/security/electron'),{encodeIR}=require('../dist/toastir/codec');
app.enableSandbox();app.setPath('userData',fs.mkdtempSync(path.join(os.tmpdir(),'bt-benchmark-')));
const deadline=setTimeout(()=>app.exit(1),60000);
app.whenReady().then(async()=>{
 const network=session.fromPartition('benchmark');hardenSession(network);const win=new BrowserWindow({show:true,width:1050,height:720,useContentSize:true,webPreferences:{...WEB_PREFERENCES,session:network}}),wc=win.webContents,controller=new ToastController(wc);hardenWebContents(wc);
 const fixture='<!doctype html><html><head><style>section{padding:8px;border-bottom:1px solid #ddd}button{padding:8px}</style></head><body><h1>Local benchmark</h1>'+Array.from({length:200},(_,i)=>`<section><h2>Item ${i}</h2><p>${'Local fixture descriptive content. '.repeat(15)}</p><button onclick="this.textContent=\'Done\'">Action ${i}</button></section>`).join('')+'</body></html>';
 wc.session.protocol.handle('https',()=>new Response(fixture,{headers:{'Content-Type':'text/html'}}));await wc.loadURL('https://benchmark.test/');win.setContentSize(1050,720);win.show();win.focus();controller.grant(new Set(['read']));await new Promise(r=>setTimeout(r,200));
 const samples={dom:[],ir:[],png:[]};let dom='',snapshot,png;
 for(let i=0;i<6;i++){
  let start=performance.now();dom=await wc.executeJavaScript('document.documentElement.outerHTML');if(i)samples.dom.push(performance.now()-start);
  start=performance.now();snapshot=await controller.snapshot();if(i)samples.ir.push(performance.now()-start);
  start=performance.now();const shot=await wc.capturePage(undefined,{stayHidden:false,stayAwake:true});if(shot.getSize().width<100||shot.getSize().height<100)throw new Error('Screenshot surface dimensions unavailable');png=shot.toPNG();if(i)samples.png.push(performance.now()-start);
 }
 const {tab,...data}=snapshot;const binary=encodeIR(data);const median=a=>[...a].sort((a,b)=>a-b)[Math.floor(a.length/2)];
 const report={generatedAt:new Date().toISOString(),platform:process.platform,electron:process.versions.electron,chromium:process.versions.chrome,fixture:{sections:200,viewport:{width:1050,height:720}},
  measurements:{dom:{bytes:Buffer.byteLength(dom),medianCaptureMs:median(samples.dom)},toastIR:{jsonBytes:Buffer.byteLength(JSON.stringify(data)),binaryBytes:binary.length,elements:data.elements.length,medianCaptureMs:median(samples.ir)},screenshot:{pngBytes:png.length,medianCaptureMs:median(samples.png)},mainProcessRssBytes:process.memoryUsage().rss},
  limitations:['Local deterministic fixture only; not a general website benchmark.','DOM and ToastIR cover the document; screenshot covers the viewport, so they are different representations.','No real model calls, tokenizer measurements, cost or end-to-end task success comparison.','No claim that 3x speed, 50% tokens, 70% fewer calls or 95% task success targets were achieved.']};
 fs.mkdirSync('artifacts',{recursive:true});fs.writeFileSync('artifacts/performance-local.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report.measurements));controller.dispose();win.destroy();clearTimeout(deadline);app.exit(0);
}).catch(e=>{console.error(e);clearTimeout(deadline);app.exit(1)});
