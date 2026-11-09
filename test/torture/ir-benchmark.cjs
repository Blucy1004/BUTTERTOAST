const {app,BrowserWindow}=require('electron'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),assert=require('node:assert/strict');
const {settleTaskAction}=require('../../dist/toastir/navigation');
const {createAiTask}=require('../../dist/browser/ai-task'),{WEB_PREFERENCES}=require('../../dist/security/electron');
const {modelSnapshot,chooseModelFrame,applyModelFrame}=require('../../dist/toastir/model'),{page}=require('./pages.cjs'),{treeMetrics}=require('../../scripts/benchmark-support.cjs'),{wait,until,stats}=require('./long-common.cjs');
app.enableSandbox();app.commandLine.appendSwitch('site-per-process');app.setPath('userData',fs.mkdtempSync(path.join(os.tmpdir(),'bt-ir-performance-')));
const origin='https://benchmark.test',rows=[],deltaChecks=[],deadline=setTimeout(()=>app.exit(2),180000);let sequence=0;
app.whenReady().then(async()=>{
 const host=new BrowserWindow({show:true,width:1000,height:900,webPreferences:WEB_PREFERENCES});await host.loadURL('about:blank');
 const task=createAiTask(),wc=task.view.webContents,c=task.controller;host.contentView.addChildView(task.view);task.view.setBounds({x:0,y:0,width:900,height:800});wc.session.protocol.handle('https',()=>new Response(page,{headers:{'Content-Type':'text/html'}}));wc.debugger.attach('1.3');
 async function trial(method,name,steps,verify,round){
  await wc.loadURL(origin+'/');wc.focus();await wc.executeJavaScript('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');c.grant(new Set(['read','write','transmit','delete','pay']));
  const before=treeMetrics(),at=performance.now();let commands=0,bytes=0,frameBytes=0,fullBytes=0,previous=null,success=false,error=null;
  async function protocol(command,params){commands++;bytes+=Buffer.byteLength(JSON.stringify({command,params}));const response=await wc.debugger.sendCommand(command,params);bytes+=Buffer.byteLength(JSON.stringify(response));return response;}
  async function evaluate(expression){const result=await protocol('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(result.exceptionDetails)throw Error(result.exceptionDetails.text);return result.result.value;}
  async function ordinary(step){
   if(step.op==='FILL'){await evaluate(`document.querySelector(${JSON.stringify(step.selector)}).focus()`);await protocol('Input.insertText',{text:step.value});}
   if(step.op==='CLICK'){const point=await evaluate(`(()=>{const r=(${step.expression??`document.querySelector(${JSON.stringify(step.selector)})`}).getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`);await protocol('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...point});await protocol('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...point});}
   if(step.op==='NAVIGATE'){await protocol('Page.navigate',{url:origin+step.value});await until(()=>!wc.isLoading()&&wc.getURL()===origin+step.value,'CDP navigate');}
   if(step.op==='WAIT')await wait(Number(step.value));
   if(step.op==='EXTRACT')return evaluate('document.querySelector("section").innerText');
  }
  async function ir(step){
   const snapshot=await c.snapshot(),context={...snapshot,source:'task',elements:snapshot.elements.filter(e=>e.visible&&e.enabled&&!e.sensitive).slice(0,100)},full=modelSnapshot(context);assert.ok(full);const frame=chooseModelFrame(full,previous);assert.deepEqual(applyModelFrame(previous,JSON.parse(JSON.stringify(frame))),full);frameBytes+=Buffer.byteLength(JSON.stringify(frame));fullBytes+=Buffer.byteLength(JSON.stringify(full));bytes+=Buffer.byteLength(JSON.stringify(frame));previous=full;
   const element=step.name?snapshot.elements.find(e=>e.name===step.name):null;assert.ok(!step.name||element,'IR target '+step.name);
   const action={protocol:2,document:snapshot.document,id:'perf'+(++sequence),tab:snapshot.tab,origin:snapshot.origin,version:snapshot.version,op:step.op,target:element?.id??'',value:step.op==='NAVIGATE'?origin+step.value:step.value??''};commands++;bytes+=Buffer.byteLength(JSON.stringify(action));
   const approval=['CLICK','FILL','NAVIGATE'].includes(step.op)?await c.requestApproval(action,async()=>true):undefined;
   const result=await settleTaskAction(wc,snapshot.origin,action,()=>!wc.isDestroyed(),()=>c.execute(action,approval));bytes+=Buffer.byteLength(JSON.stringify(result));if(!result.ok&&!(step.op==='NAVIGATE'&&wc.getURL()===origin+step.value))throw Error(result.reason);if(step.op==='NAVIGATE'){await until(()=>!wc.isLoading(),'IR navigation');c.grant(new Set(['read','write','transmit','delete','pay']));}return result.text;
  }
  let observed;
  try{for(const step of steps){if(step.setup)await wc.executeJavaScript(step.setup);else observed=await(method==='ToastIR'?ir(step):ordinary(step));}await until(async()=>{try{await verify(wc,observed);return true}catch{return false}},'actual workflow result',1500);success=true;}catch(e){error=String(e.stack);}
  const elapsedMs=performance.now()-at,after=treeMetrics();rows.push({method,name,round,success,error,elapsedMs,commands,retries:0,protocolBytes:bytes,modelFrameBytes:frameBytes,fullFrameBytes:fullBytes,cpuMsLowerBound:Math.max(0,(after.cpuTicks-before.cpuTicks)*10),cpuCounterRegression:after.cpuTicks<before.cpuTicks,pssBeforeMiB:before.pssMiB,pssAfterMiB:after.pssMiB});console.log(success?'PASS':'FAIL',method,name,elapsedMs.toFixed(1),error??'');
 }
 const scenarios=[
  ['search',[{op:'FILL',selector:'#query',name:'Search query',value:'toast'},{op:'CLICK',selector:'#search',name:'Search'}],async w=>assert.equal(await w.executeJavaScript('result.textContent'),'Result: toast')],
  ['form fields',[{op:'FILL',selector:'#query',name:'Search query',value:'one'},{op:'FILL',selector:'#note',name:'Note',value:'two'}],async w=>assert.deepEqual(await w.executeJavaScript('[query.value,note.value]'),['one','two'])],
  ['dynamic button',[{setup:'addLate()'},{op:'WAIT',value:'150'},{op:'CLICK',selector:'#dynamic button',name:'Late button'}],async w=>assert.equal(await w.executeJavaScript('counts.late'),1)],
  ['multi-page navigation',[{op:'NAVIGATE',value:'/step-1'},{op:'NAVIGATE',value:'/step-2'}],async w=>assert.equal(w.getURL(),origin+'/step-2')],
  ['table extraction',[{op:'EXTRACT',name:'Inventory'}],async(_w,text)=>{assert.match(text,/Toast/);assert.match(text,/42/)}],
  ['SPA',[{op:'CLICK',selector:'#spa',name:'SPA route'}],async w=>{assert.equal(w.getURL(),origin+'/spa');assert.equal(await w.executeJavaScript('route.textContent'),'SPA route ready')}],
  ['nested Shadow DOM',[{op:'CLICK',expression:'document.getElementById("open").shadowRoot.querySelector("x-nested").shadowRoot.querySelector("button")',name:'Nested button'}],async w=>assert.equal(await w.executeJavaScript('counts.nestedClick'),1)]
 ];
 for(let round=1;round<=3;round++)for(const [name,steps,verify] of scenarios)for(const method of round%2?['CDP automation','ToastIR']:['ToastIR','CDP automation'])await trial(method,name,steps,verify,round);
 // Real DOM frames: changed text, insertion/removal, order, round-trip, duplicate and missing baseline.
 await wc.loadURL(origin+'/');wc.focus();await wc.executeJavaScript('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');c.grant(new Set(['read']));const frame=async()=>{const s=await c.snapshot();return modelSnapshot({...s,source:'task',elements:s.elements.filter(e=>!e.sensitive).slice(0,100)})};const first=await frame();await wc.executeJavaScript('read.textContent="Changed evidence";button.remove();document.body.insertAdjacentHTML("afterbegin","<button>Inserted</button>")');const second=await frame(),{modelDelta}=require('../../dist/toastir/model'),delta=modelDelta(first,second);assert.deepEqual(applyModelFrame(first,JSON.parse(JSON.stringify(delta))),second);assert.equal(applyModelFrame(second,delta),null);assert.equal(applyModelFrame(null,delta),null);const malformed={...delta};delete malformed.order;assert.equal(applyModelFrame(first,malformed),null);deltaChecks.push({id:'DELTA-REAL-01',pass:true,fullBytes:Buffer.byteLength(JSON.stringify(second)),deltaBytes:Buffer.byteLength(JSON.stringify(delta))});
 const summaries=scenarios.flatMap(([name])=>['CDP automation','ToastIR'].map(method=>{const values=rows.filter(r=>r.name===name&&r.method===method);return {name,method,successes:values.filter(r=>r.success).length,trials:values.length,time:stats(values.map(r=>r.elapsedMs))}}));
 fs.writeFileSync('artifacts/torture/ir-performance.json',JSON.stringify({versions:process.versions,generatedAt:new Date().toISOString(),methodology:'Same Electron, fixture, 900x800 viewport, alternating order, 3 repeats. CDP fixed selectors and native Input events versus ToastController snapshot/approval/execute. Test-only immediate host approval excludes human think time. No real model. Command counts are protocol-level operations, not equivalent units. Payloads contain different information. CPU /proc live-tree delta lower bound with 10ms tick resolution; concurrent long benchmark load.',rows,summaries,deltaChecks},null,2));wc.debugger.detach();await task.close();host.destroy();clearTimeout(deadline);app.exit(rows.some(r=>!r.success)?1:0);
}).catch(e=>{console.error(e);clearTimeout(deadline);app.exit(1)});
