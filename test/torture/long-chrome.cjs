const {spawn}=require('node:child_process'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {chromium}=require(process.env.BUTTERTOAST_PLAYWRIGHT_MODULE||'playwright-core'),{settings,fixture,until,run,wait}=require('./long-common.cjs');
const config=settings(),profile=fs.mkdtempSync(path.join(os.tmpdir(),'bt-torture-chrome-')),binary=process.env.BUTTERTOAST_CHROME_PATH;if(!binary)throw Error('Official Chrome path required');
let child,browser;
(async()=>{
 const local=await fixture();child=spawn(binary,['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check','--site-per-process','--remote-debugging-port=0',`--user-data-dir=${profile}`,'about:blank'],{stdio:['ignore','ignore','pipe']});child.stderr.on('data',()=>{});
 let port;await until(()=>{if(child.exitCode!==null)throw Error('Chrome exited');try{port=Number(fs.readFileSync(path.join(profile,'DevToolsActivePort'),'utf8').split('\n')[0]);return !!port}catch{return false}},'CDP port');
 browser=await chromium.connectOverCDP(`http://127.0.0.1:${port}`);const context=browser.contexts()[0],pages=[];let crashCallback=()=>{};
 const driver={name:'Google Chrome for Testing',version:browser.version(),source:{officialBinary:binary},pid:child.pid,policy:{memorySaver:'Chrome default; not forced',input:'CDP tab activation; fixed JS page scroll',headless:true,unresponsive:'Not directly observable; CDP operation failures recorded',recovery:'driver recreates crashed page and restores URL; Chrome native reload not verified'},onCrash(fn){crashCallback=fn;},
  async open(i){const page=i?await context.newPage():context.pages()[0];pages.push(page);page.on('crash',()=>crashCallback('crashed'));await page.setViewportSize({width:742,height:686});await page.goto(local.url(i),{waitUntil:'load',timeout:15000});},
  async select(i){await pages[i].bringToFront();},async ready(i){await pages[i].waitForLoadState('load');if(new URL(pages[i].url()).hostname!==`t${i}.localhost`)throw Error('Wrong restored URL');},async navigate(i,page){await pages[i].goto(local.url(i,page),{waitUntil:'load',timeout:15000});},async evaluate(i,code){return pages[i].evaluate(code);},async memorySaver(){},
  async inspect(){return {logicalTabs:pages.length,livePages:pages.filter(p=>!p.isClosed()).length,suspended:null,unresponsive:null};},
  async crashAndRecover(i){const old=pages[i],url=old.url(),client=await context.newCDPSession(old);void client.send('Page.crash').catch(()=>{});await wait(300);const replacement=await context.newPage();replacement.on('crash',()=>crashCallback('crashed'));await replacement.setViewportSize({width:742,height:686});await replacement.goto(url,{waitUntil:'load',timeout:15000});await old.close();pages[i]=replacement;await this.ready(i);}

 };
 try{const result=await run(driver,config,process.env.BT_TORTURE_OUTPUT);console.log('COMPLETE',config.scenario,result.elapsedMs);}finally{await browser.close();child.kill('SIGTERM');local.server.close();}
})().catch(e=>{console.error(e);child?.kill('SIGTERM');process.exit(1)});
