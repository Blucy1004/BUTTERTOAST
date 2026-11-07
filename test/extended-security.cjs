// Authorized local fixtures only; production main and policy are loaded without protection overrides.
const { app, BrowserWindow, WebContentsView, webContents, session }=require('electron');
const assert=require('node:assert/strict'),http=require('node:http'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const profile=fs.mkdtempSync(path.join(os.tmpdir(),'bt-extended-'));app.setPath('userData',profile);
const wait=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn,label){for(let i=0;i<200;i++){if(await fn())return;await wait(25)}throw Error(label)}
let groups=0,server;const pass=name=>{groups++;console.log('PASS',name)};
const deadline=setTimeout(()=>{console.error('FAIL extended timeout');app.exit(1)},60000);
require('../dist/main');
app.whenReady().then(async()=>{
 const win=BrowserWindow.getAllWindows()[0],ui=win.webContents;
 await until(()=>!ui.isLoading()&&ui.getURL()==='toast-ui://app/index.html'&&webContents.getAllWebContents().length>1,'application startup');
 const wc=webContents.getAllWebContents().find(w=>w.id!==ui.id);
 const arrivals=[];
 server=http.createServer((req,res)=>{
  arrivals.push(req.url);res.setHeader('Content-Type','text/html');
  if(req.url==='/private'){res.end('CROSS_ORIGIN_PRIVATE_MARKER');return}
  res.end('<!doctype html><title>Fixture</title><button id="target">Click</button><script>window.marker="local"</script>');
 });await new Promise(r=>server.listen(0,r));
 const origin=`http://127.0.0.1:${server.address().port}`,other=`http://localhost:${server.address().port}`;
 await ui.executeJavaScript(`window.browser.command({type:'navigate',address:${JSON.stringify(origin)}})`);
 await until(()=>wc.getURL()===origin+'/'&&!wc.isLoading(),'fixture navigation');
 assert.equal(app.commandLine.hasSwitch('allow-file-access-from-files'),false);
 const prefs=wc.getLastWebPreferences();
 for(const key of ['sandbox','contextIsolation','webSecurity'])assert.equal(prefs[key],true,key);
 for(const key of ['nodeIntegration','nodeIntegrationInWorker','nodeIntegrationInSubFrames','webviewTag','allowRunningInsecureContent'])assert.equal(!!prefs[key],false,key);
 assert.equal(prefs.preload,undefined);assert.equal(wc.getBackgroundThrottling(),true);
 console.log('Runtime versions',JSON.stringify({electron:process.versions.electron,chrome:process.versions.chrome,node:process.versions.node,v8:process.versions.v8}));
 pass('runtime renderer security configuration and no remote preload');
 const response=await ui.session.fetch('toast-ui://app/index.html');
 assert.equal(response.headers.get('x-content-type-options'),'nosniff');assert.match(response.headers.get('content-security-policy'),/frame-ancestors 'none'/);
 for(const target of ['package.json','%2e%2e/package.json','%252e%252e/package.json','..%5cpackage.json','index.html?x=1','index.html%00.js'])await assert.rejects(ui.session.fetch('toast-ui://app/'+target));
 for(const target of ['toast-ui://user@app/index.html','toast-ui://attacker:99/index.html','toast-ui://attacker/index.html']){const r=await ui.session.fetch(target).catch(()=>null);assert.ok(!r||!r.ok,target);}
 await assert.rejects(ui.session.fetch('toast-ui://app/index.html',{method:'POST',body:'x'}));
 // Chromium canonicalizes ports out of this custom scheme before our handler sees it.
 // This alias may return only the same public UI asset, never another host or file.
 const alias=await ui.session.fetch('toast-ui://app:99/index.html');assert.equal(await alias.text(),await response.text());
 pass('UI path/encoding/host/credentials/method attacks rejected; canonical alias stays in asset allowlist');
 await ui.executeJavaScript(`window.injection=0;window.violations=[];document.addEventListener('securitypolicyviolation',e=>window.violations.push(e.violatedDirective));
 const s=document.createElement('script');s.textContent='window.injection++';document.body.append(s);
 const remote=document.createElement('script');remote.src=${JSON.stringify(origin+'/exfil-script')};document.body.append(remote);
 const frame=document.createElement('iframe');frame.src=${JSON.stringify(origin+'/exfil-frame')};document.body.append(frame);
 const f=document.createElement('form');f.action=${JSON.stringify(origin+'/exfil-form')};f.method='POST';document.body.append(f);f.submit();void 0`);
 await until(async()=> (await ui.executeJavaScript('violations.length'))>=3,'CSP violation events');
 assert.equal(await ui.executeJavaScript('injection'),0);
 assert.equal(await ui.executeJavaScript(`fetch(${JSON.stringify(origin+'/exfil-fetch')}).then(()=>true,()=>false)`),false);
 assert.equal(arrivals.some(u=>u.startsWith('/exfil-')),false);
 pass('actual UI inline/external script, iframe, form and fetch injection blocked');
 assert.equal(await wc.executeJavaScript(`fetch('toast-ui://app/index.html').then(()=>true,()=>false)`),false);
 const before=webContents.getAllWebContents().length;
 await wc.executeJavaScript(`for(const url of ['about:blank','file:///not-a-real-secret','https://example.invalid/','buttertoast-denied://fixture'])window.open(url,'','nodeIntegration=yes,contextIsolation=no,sandbox=no');
 const v=document.createElement('webview');v.src=${JSON.stringify(origin)};v.setAttribute('nodeintegration','');document.body.append(v);void 0`);
 await wait(100);assert.equal(webContents.getAllWebContents().length,before);
 pass('remote content cannot read UI assets, create popups or instantiate privileged webviews');
 for(const target of ['file:///not-a-real-secret','data:text/html,untrusted','toast-ui://app/index.html','chrome://settings','devtools://devtools/bundled/inspector.html','buttertoast-denied://fixture']){
  await wc.executeJavaScript(`location.href=${JSON.stringify(target)};void 0`);await wait(60);assert.equal(wc.getURL(),origin+'/');
 }
 await wc.executeJavaScript(`window.blobUrl=URL.createObjectURL(new Blob(['<h1>blob</h1>'],{type:'text/html'}));location.href=blobUrl;void 0`);await wait(80);assert.equal(wc.getURL(),origin+'/');
 pass('page-driven local/custom/internal/data/blob navigation cannot escape allowed web URLs');
 const workerResult=await wc.executeJavaScript(`new Promise((resolve,reject)=>{const u=URL.createObjectURL(new Blob(['postMessage([typeof require,typeof process,typeof browser])'],{type:'text/javascript'}));const w=new Worker(u);w.onmessage=e=>{w.terminate();URL.revokeObjectURL(u);resolve(e.data)};w.onerror=reject})`);
 assert.deepEqual(workerResult,['undefined','undefined','undefined']);
 pass('untrusted dedicated worker has no Node or privileged bridge');
 await wc.executeJavaScript(`new Promise(r=>{const f=document.createElement('iframe');f.id='foreign';f.src=${JSON.stringify(other+'/private')};f.onload=r;document.body.append(f)})`);
 assert.equal(await wc.executeJavaScript(`(()=>{try{return document.querySelector('#foreign').contentWindow.document.body.textContent}catch(e){return e.name}})()`),'SecurityError');
 assert.equal(await wc.executeJavaScript(`fetch(${JSON.stringify(other+'/private')}).then(r=>r.text()).then(()=>true,()=>false)`),false);
 assert.equal(await wc.executeJavaScript(`fetch(${JSON.stringify(origin+'/private')}).then(r=>r.text())`),'CROSS_ORIGIN_PRIVATE_MARKER');
 pass('cross-origin frame and CORS reads denied with same-origin positive control');
 for(const name of ['geolocation','notifications','camera','microphone'])assert.equal(await wc.executeJavaScript(`navigator.permissions.query({name:${JSON.stringify(name)}}).then(p=>p.state)`),'denied',name);
 assert.notEqual(await wc.executeJavaScript('navigator.mediaDevices.getUserMedia({audio:true}).then(s=>{s.getTracks().forEach(t=>t.stop());return "granted"},e=>e.name)',true),'granted');
 assert.notEqual(await wc.executeJavaScript('navigator.mediaDevices.getDisplayMedia({video:true}).then(s=>{s.getTracks().forEach(t=>t.stop());return "granted"},e=>e.name)',true),'granted');
 pass('camera/microphone/geolocation/notification and display capture remain denied');
 const { hardenSession,hardenWebContents,WEB_PREFERENCES }=require('../dist/security/electron');
 const secureSession=session.fromPartition('extended-https-policy');hardenSession(secureSession);let insecureRequests=0;
 secureSession.protocol.handle('http',()=>{insecureRequests++;return new Response('insecure')});
 secureSession.protocol.handle('https',request=>new URL(request.url).pathname==='/redirect'?new Response(null,{status:302,headers:{Location:'http://insecure.fixture.test/'}}):new Response('<!doctype html><title>Secure fixture</title><a id="down" href="http://insecure.fixture.test/">downgrade</a>',{headers:{'Content-Type':'text/html'}}));
 const secure=new WebContentsView({webPreferences:{...WEB_PREFERENCES,session:secureSession}});win.contentView.addChildView(secure);hardenWebContents(secure.webContents);
 await secure.webContents.loadURL('https://secure.fixture.test/');
 await secure.webContents.executeJavaScript('document.querySelector("#down").click()');await wait(80);assert.equal(secure.webContents.getURL(),'https://secure.fixture.test/');
 await assert.rejects(secure.webContents.loadURL('https://secure.fixture.test/redirect'));
 assert.equal(insecureRequests,0);secure.webContents.close({waitForBeforeUnload:false});
 pass('HTTPS page and redirect downgrade rejected before insecure fixture request');
 const start=await ui.executeJavaScript('document.querySelectorAll(".tab").length');
 await ui.executeJavaScript(`for(let i=0;i<250;i++)window.browser.command({type:'new',approved:true});window.browser.command({type:'new'})`);
 await wait(80);assert.equal(await ui.executeJavaScript('document.querySelectorAll(".tab").length'),start);
 await wait(250);await ui.executeJavaScript('window.browser.command({type:"new"})');
 await until(async()=>await ui.executeJavaScript('document.querySelectorAll(".tab").length')===start+1,'legitimate IPC after flood');
 pass('malformed IPC burst is bounded and normal user command recovers');
 await wc.executeJavaScript(`window.fakeEvents=0;for(let i=0;i<50;i++){document.dispatchEvent(new KeyboardEvent('keydown',{key:'t',ctrlKey:true,bubbles:true}));window.postMessage({type:'new'},'*')}void 0`);
 await wait(80);assert.equal(await ui.executeJavaScript('document.querySelectorAll(".tab").length'),start+1);
 pass('page synthetic shortcuts and postMessage cannot invoke privileged commands');
 // Read flags through a mock only. Never launch Electron with unsafe flags.
 const { assertSafeLaunch }=require('../dist/security/electron');const original=app.commandLine.hasSwitch;
 try{
  for(const flag of ['ignore-certificate-errors-spki-list','disable-gpu-sandbox','single-process','allow-insecure-localhost','unsafely-treat-insecure-origin-as-secure']){
   app.commandLine.hasSwitch=name=>name===flag;assert.throws(()=>assertSafeLaunch(),/Unsafe|unsupported/,flag);
  }
 }finally{app.commandLine.hasSwitch=original}
 pass('alternate unsafe launch switches rejected without disabling real sandbox');
 clearTimeout(deadline);server.closeAllConnections();server.close();win.destroy();console.log(`Extended security groups: ${groups} passed`);app.exit(0);
}).catch(error=>{console.error('FAIL',error);clearTimeout(deadline);server?.closeAllConnections();server?.close();app.exit(1)});
