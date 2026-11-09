// Local standard browser capability checks; CDP selection is fixture-only, never exposed to AI.
const {app,BrowserWindow,session}=require('electron'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {BrowserTabs}=require('../dist/browser/tabs'),{WEB_PREFERENCES,hardenSession,assertSafeLaunch}=require('../dist/security/electron');
const directory=fs.mkdtempSync(path.join(os.tmpdir(),'bt-local-media-'));app.setPath('userData',directory);app.enableSandbox();assertSafeLaunch();app.commandLine.appendSwitch('site-per-process');
const deadline=setTimeout(()=>{console.error('Local compatibility timeout');app.exit(1)},25000),wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(fn,label){for(let i=0;i<300;i++){if(await fn())return;await wait(20)}throw Error(label)}
app.whenReady().then(async()=>{
 const win=new BrowserWindow({show:true,width:800,height:600,webPreferences:WEB_PREFERENCES}),browsing=session.fromPartition('persist:human');hardenSession(browsing);await win.loadURL('about:blank');let uploads=0;
 const content='BUTTERTOAST-LOCAL-UPLOAD-FIXTURE',file=path.join(directory,'upload-fixture.txt');fs.writeFileSync(file,content);
 browsing.protocol.handle('https',async request=>{
  const route=new URL(request.url).pathname;
  if(route==='/playback.webm')return new Response(fs.readFileSync(path.join(__dirname,'fixtures/playback.webm')),{headers:{'Content-Type':'video/webm'}});
  if(route==='/upload'){assert.equal(request.method,'POST');assert.match(request.headers.get('content-type'),/^multipart\/form-data; boundary=/);const body=await request.text();assert.ok(body.includes(content));assert.ok(body.includes('filename="upload-fixture.txt"'));uploads++;return new Response('<title>Uploaded local fixture</title><p>received</p>',{headers:{'Content-Type':'text/html'}});}
  return new Response('<title>Local media and upload</title><video id="video" src="/playback.webm" muted autoplay loop controls width="64" height="64"></video><form action="/upload" method="post" enctype="multipart/form-data"><input type="file" name="file" id="file"><button id="submit">Upload fixture</button></form>',{headers:{'Content-Type':'text/html'}});
 });
 let tabs;tabs=new BrowserTabs(win,{changed(){tabs?.layout()},persist(){},input(){}});tabs.setViewport({x:0,y:0,width:800,height:600});tabs.initialize(null);tabs.navigate('https://compatibility.test/page');const wc=tabs.activeContents();
 await until(()=>!wc.isLoading()&&wc.getURL()==='https://compatibility.test/page','page');await until(()=>wc.executeJavaScript('document.getElementById("video").currentTime>0.5'),'video playback');
 const playback=await wc.executeJavaScript('({currentTime:video.currentTime,width:video.videoWidth,height:video.videoHeight,decodedFrames:video.getVideoPlaybackQuality().totalVideoFrames,error:video.error?.code??null})');assert.equal(playback.width,64);assert.equal(playback.error,null);assert.ok(playback.decodedFrames>0);assert.deepEqual(await wc.executeJavaScript('[typeof require,typeof browser]'),['undefined','undefined']);
 wc.debugger.attach('1.3');const {root}=await wc.debugger.sendCommand('DOM.getDocument');const {nodeId}=await wc.debugger.sendCommand('DOM.querySelector',{nodeId:root.nodeId,selector:'#file'});await wc.debugger.sendCommand('DOM.setFileInputFiles',{nodeId,files:[file]});wc.debugger.detach();
 // The headless WebContentsView has no reliable native pointer surface on this host.
 // Test the browser's form/upload implementation; the OS chooser and native click remain unverified.
 await wc.executeJavaScript('document.querySelector("form").requestSubmit()',true);
 await until(()=>uploads===1&&!wc.isLoading()&&wc.getURL()==='https://compatibility.test/upload','upload');
 fs.mkdirSync('artifacts',{recursive:true});fs.writeFileSync('artifacts/local-media-upload-golden.json',JSON.stringify({version:require('../package.json').version,playback,uploads,scope:'Local VP9 silent clip; CDP fixture file selection + web form submission; OS file chooser, DRM and external uploads not tested',generatedAt:new Date().toISOString()},null,2)+'\n');
 console.log('PASS local VP9 playback and multipart fixture upload');tabs.dispose();win.destroy();clearTimeout(deadline);app.exit(0);
}).catch(error=>{console.error(error);clearTimeout(deadline);app.exit(1)});
