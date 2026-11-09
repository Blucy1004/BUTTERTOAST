// Local fixtures only. Runs the production tab manager and privacy handlers in sandboxed Electron.
const { app, BrowserWindow, WebContentsView, webContents, session } = require('electron');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { BrowserTabs } = require('../dist/browser/tabs');
const { installPrivacy } = require('../dist/browser/privacy');
const { WEB_PREFERENCES, hardenSession, hardenWebContents } = require('../dist/security/electron');
app.enableSandbox();app.commandLine.appendSwitch('site-per-process');
app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(),'bt-lifecycle-')));
const wait=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn, label, duration=8000) { const end=Date.now()+duration;while(Date.now()<end){if(await fn())return;await wait(40)}throw Error(label); }
const timeout=setTimeout(()=>{console.error('FAIL lifecycle timeout');app.exit(1)},60000);
let server, win, manager;
const requests=[];
app.whenReady().then(async()=>{
  server=http.createServer((req,res)=>{
    requests.push({host:req.headers.host,url:req.url,method:req.method,headers:req.headers});
    if(req.url==='/slow')return;
    res.setHeader('Access-Control-Allow-Origin','*');
    if(req.url.startsWith('/echo')){res.setHeader('Content-Type','application/json');res.end(JSON.stringify(req.headers));return;}
    res.setHeader('Content-Type','text/html');res.end('<title>Local fixture</title><input id="draft"><button id="hang" onclick="while(true){}">Hang</button>');
  });
  await new Promise(resolve=>server.listen(0,resolve));
  const port=server.address().port, url=`http://127.0.0.1:${port}`, other=`http://localhost:${port}`;
  hardenSession(session.fromPartition('persist:human'));
  win=new BrowserWindow({width:1000,height:700,webPreferences:WEB_PREFERENCES});
  await win.loadURL(`${url}/shell`);
  const created=[];let snapshot;
  manager=new BrowserTabs(win,{changed:()=>{},persist:value=>{snapshot=value},input:wc=>created.push(wc)},150);
  manager.initialize({version:1,active:0,tabs:[`${url}/one`,`${other}/two`]});
  assert.equal(created.length,0);assert.equal(manager.state().status,'suspended');
  assert.equal(requests.some(r=>['/one','/two'].includes(r.url)),false);
  const [one,two]=manager.state().tabs.map(t=>t.id);
  manager.select(one);const first=created.at(-1);await until(()=>!first.isLoading()&&first.getURL()===`${url}/one`,'first lazy restore');
  assert.equal(created.length,1);assert.equal(requests.some(r=>r.url==='/two'),false);
  assert.equal(requests.find(r=>r.url==='/one').method,'GET');
  console.log('PASS URL-only session restore stays dormant until selected; one tab loads with GET');
  manager.select(two);const second=created.at(-1);await until(()=>!second.isLoading()&&second.getURL()===`${other}/two`,'second lazy restore');
  assert.notEqual(first.getOSProcessId(),second.getOSProcessId());
  manager.move(two,-1);assert.deepEqual(manager.state().tabs.map(t=>t.id),[two,one]);assert.equal(snapshot.active,0);
  manager.close(two);await until(()=>second.isDestroyed(),'closed view released');assert.equal(manager.state().canReopen,true);
  manager.reopen();const reopened=created.at(-1);await until(()=>!reopened.isLoading()&&reopened.getURL()===`${other}/two`,'reopen');
  assert.equal(manager.state().tabs.length,2);assert.notEqual(manager.state().active,two);
  console.log('PASS tab ordering, close and recently closed URL reopen');
  await reopened.executeJavaScript('document.getElementById("draft").value="unsaved form"');
  const sameId=manager.state().active;
  manager.suspend();await until(()=>reopened.isDestroyed(),'suspended WebContents destroyed');
  assert.equal(manager.state().status,'suspended');assert.equal(manager.state().active,sameId);
  manager.select(sameId);const resumed=created.at(-1);await until(()=>!resumed.isLoading()&&resumed.getURL()===`${other}/two`,'resume');
  assert.equal(await resumed.executeJavaScript('document.getElementById("draft").value'),'');
  for(const key of ['sandbox','contextIsolation','webSecurity'])assert.equal(resumed.getLastWebPreferences()[key],true);
  assert.equal(resumed.getBackgroundThrottling(),true);
  console.log('PASS manual memory release destroys contents; explicit resume creates an isolated fresh page');
  manager.navigate(`${other}/slow`);await until(()=>manager.state().status==='slow','slow load signaled');manager.history('stop');
  assert.equal(manager.state().loading,false);
  console.log('PASS slow network load signaled and stopped');
  manager.navigate(`${other}/two`);await until(()=>!resumed.isLoading()&&resumed.getURL()===`${other}/two`,'navigate after stop');
  resumed.forcefullyCrashRenderer();await until(()=>manager.state().status==='crashed','crash signaled');
  assert.equal(await first.executeJavaScript('1+1'),2);
  manager.restart();const restarted=created.at(-1);await until(()=>!restarted.isLoading()&&restarted.getURL()===`${other}/two`,'restart crash');
  assert.equal(manager.state().active,sameId);assert.equal(resumed.isDestroyed(),true);
  assert.deepEqual(await restarted.executeJavaScript('[typeof require,typeof browser]'),['undefined','undefined']);
  console.log('PASS crashed tab recreated with same logical ID; other-site tab remains responsive');
  // A real renderer event-loop hang, not a manually emitted unresponsive event.
  restarted.focus();void restarted.executeJavaScript('document.getElementById("hang").click()').catch(()=>{});
  await wait(100);restarted.sendInputEvent({type:'keyDown',keyCode:'A'});
  await until(()=>manager.state().status==='unresponsive','active renderer responsiveness detection',22000);
  assert.equal(await first.executeJavaScript('2+2'),4);
  manager.restart();const recovered=created.at(-1);
  await until(()=>restarted.isDestroyed()&&!recovered.isLoading()&&recovered.getURL()===`${other}/two`,'hung tab restart');
  assert.equal(await recovered.executeJavaScript('3+3'),6);
  console.log('PASS real infinite-loop renderer detected and replaced without stopping other-site tab');
  // Reopening a form result must never replay a POST body.
  await recovered.loadURL(`${other}/post`,{postData:[{type:'rawData',bytes:Buffer.from('private=form-value')}],extraHeaders:'Content-Type: application/x-www-form-urlencoded'});
  assert.equal(requests.filter(r=>r.url==='/post').at(-1).method,'POST');
  manager.restart();const postRestored=created.at(-1);await until(()=>!postRestored.isLoading()&&postRestored.getURL()===`${other}/post`,'POST result restart');
  assert.equal(requests.filter(r=>r.url==='/post').at(-1).method,'GET');
  assert.equal(JSON.stringify(manager.snapshot()).includes('form-value'),false);
  console.log('PASS restart stores URLs only and does not replay POST or form data');
  const longUrl=`${other}/${'x'.repeat(4100)}`;
  await postRestored.executeJavaScript(`history.replaceState(null,'',${JSON.stringify(longUrl)})`);
  await until(()=>manager.state().url===longUrl,'live address must not retain previous URL');
  assert.equal(manager.snapshot().tabs.at(-1).url,'');
  console.log('PASS overlong page-controlled URL updates address display but is excluded from restore');
  // Keep logical tabs while releasing all their WebContents; creation is bounded to 64.
  while(manager.state().tabs.length<8)manager.newTab();
  const retained=manager.state().tabs.map(t=>t.id);
  for(const id of retained){manager.select(id);manager.suspend();}
  await until(()=>created.every(w=>w.isDestroyed()),'all suspended contents released');
  assert.equal(manager.state().tabs.length,8);
  manager.select(retained[0]);assert.equal(created.filter(w=>!w.isDestroyed()).length,1);
  while(manager.state().tabs.length<64){manager.newTab();manager.suspend();}
  manager.newTab();assert.equal(manager.state().tabs.length,64);
  manager.dispose();await until(()=>created.every(w=>w.isDestroyed()),'disposed contents released');
  console.log('PASS eight tabs release all contents; one selection recreates only one; 64-tab limit holds');
  // Controlled local tracker root avoids any request to real advertising services.
  const privacySession=session.fromPartition('privacy-test');hardenSession(privacySession);
  const privacy=installPrivacy(privacySession,['localhost']);
  const view=new WebContentsView({webPreferences:{...WEB_PREFERENCES,session:privacySession}});
  win.contentView.addChildView(view);const wc=view.webContents;hardenWebContents(wc);
  await wc.loadURL(`${url}/private?token=local-secret`);
  const fetchFromPage=target=>wc.executeJavaScript(`fetch(${JSON.stringify(target)},{referrerPolicy:'unsafe-url'}).then(r=>r.json()).catch(()=>null)`);
  assert.equal(await fetchFromPage(`${other}/echo-blocked`),null);
  assert.equal(requests.some(r=>r.url==='/echo-blocked'),false);
  const same=await fetchFromPage(`${url}/echo-same`);assert.equal(same['sec-gpc'],'1');assert.equal(same.dnt,'1');
  privacy.setException(`${url}/arbitrary-path`,true);
  const allowed=await fetchFromPage(`${other}/echo-allowed`);assert.ok(allowed);assert.equal(allowed.referer,`${url}/`);assert.equal(allowed['sec-gpc'],'1');
  privacy.setException(url,false);assert.equal(await fetchFromPage(`${other}/echo-reblocked`),null);
  assert.equal(requests.some(r=>r.url==='/echo-reblocked'),false);
  console.log('PASS real third-party requests blocked; exact-origin exception works; GPC/DNT and reduced Referrer observed at server');
  await wc.loadURL(`${other}/direct`);assert.ok(await fetchFromPage(`${other}/echo-first-party`));
  assert.throws(()=>installPrivacy(privacySession),/already installed/);
  wc.close({waitForBeforeUnload:false});
  console.log('PASS direct navigation and first-party resources remain usable; duplicate privacy handlers refused');
  clearTimeout(timeout);server.closeAllConnections();server.close();win.destroy();app.exit(0);
}).catch(error=>{console.error('FAIL:',error);clearTimeout(timeout);manager?.dispose();server?.closeAllConnections();server?.close();app.exit(1)});
