const {spawn}=require('node:child_process'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{performance}=require('node:perf_hooks');
// Install playwright-core separately or point to an existing installation.
const {chromium}=require(process.env.BUTTERTOAST_PLAYWRIGHT_MODULE||'playwright-core');
const {fixture,summary,measuredIdle,wait}=require('./benchmark-support.cjs');
const binary=process.env.BUTTERTOAST_CHROME_PATH;if(!binary)throw Error('Set BUTTERTOAST_CHROME_PATH to an official Chrome executable');
const profile=fs.mkdtempSync(path.join(os.tmpdir(),'bt-chrome-perf-')),start=performance.now();
const child=spawn(binary,['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check','--site-per-process','--remote-debugging-port=0',`--user-data-dir=${profile}`,'about:blank'],{stdio:['ignore','ignore','pipe']});
child.stderr.on('data',data=>fs.appendFileSync('artifacts/performance-chrome-stderr.log',data));
let browser;
(async()=>{try{
 let port;for(let i=0;i<500;i++){if(child.exitCode!==null)throw Error(`Chrome exited ${child.exitCode}`);try{port=Number(fs.readFileSync(path.join(profile,'DevToolsActivePort'),'utf8').split('\n')[0]);if(port)break}catch{}await wait(20)}if(!port)throw Error('Chrome debugging port unavailable');
 browser=await chromium.connectOverCDP(`http://127.0.0.1:${port}`);const context=browser.contexts()[0];await context.route('**/*',route=>route.fulfill({status:200,contentType:'text/html',body:fixture,headers:{'Cache-Control':'no-store'}}));
 const readyMs=performance.now()-start,pages=[],results=[];
 for(const count of [10,25,50]){const loads=[];while(pages.length<count){const at=performance.now(),page=pages.length?await context.newPage():context.pages()[0];await page.setViewportSize({width:1050,height:720});await page.goto(`https://fixture-${pages.length}.test/page`,{waitUntil:'load'});pages.push(page);loads.push(performance.now()-at);}
 const switches=[];for(const page of pages.slice(0,10)){const at=performance.now();await page.bringToFront();await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));switches.push(performance.now()-at);}results.push({tabs:count,load:summary(loads),switch:summary(switches),memory:await measuredIdle(child.pid)});console.log(`Measured Chrome ${count} tabs`);}
 fs.writeFileSync('artifacts/performance-golden-chrome.json',JSON.stringify({engine:'Google Chrome for Testing',version:browser.version(),readyMs,results,generatedAt:new Date().toISOString()},null,2)+'\n');
 }finally{if(browser)await browser.close().catch(()=>{});child.kill('SIGTERM');}})().catch(error=>{console.error(error);process.exitCode=1});
