const {spawn}=require('node:child_process'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {until,wait}=require('../test/torture/long-common.cjs');
const folder=fs.mkdtempSync(path.join(os.tmpdir(),'bt-torture-restore-')),out=path.resolve('artifacts/torture/restore.json');
let child;const server=http.createServer((req,res)=>{res.setHeader('Content-Type','text/html');res.end('<h1>RESTORE FIXTURE '+req.url+'</h1>')});
(async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin=`http://127.0.0.1:${server.address().port}`;
 function start(mode){const log=fs.openSync(path.join(folder,mode+'.log'),'w');const process=spawn(require('electron'),['--ozone-platform=headless','--disable-gpu','test/torture/restore-worker.cjs'],{detached:true,stdio:['ignore',log,log],env:{...global.process.env,BT_TORTURE_PROFILE:folder,BT_TORTURE_RESTORE_MODE:mode,BT_TORTURE_FIXTURE:origin}});process.once('exit',()=>fs.closeSync(log));return process;}
 child=start('prepare');await until(()=>{if(child.exitCode!==null)throw Error('Prepare exited '+child.exitCode);return fs.existsSync(path.join(folder,'prepared.json'))},'prepared checkpoint',30000);
 const before=JSON.parse(fs.readFileSync(path.join(folder,'prepared.json')));const exited=new Promise(resolve=>child.once('exit',(code,signal)=>resolve({code,signal})));process.kill(-child.pid,'SIGKILL');const killed=await exited;assert.equal(killed.signal,'SIGKILL');await wait(500);
 child=start('restore');await until(()=>{if(child.exitCode!==null&&child.exitCode!==0)throw Error('Restore exited '+child.exitCode);return fs.existsSync(path.join(folder,'restored.json'))},'restored URLs',30000);
 const after=JSON.parse(fs.readFileSync(path.join(folder,'restored.json')));assert.deepEqual(after.urls,before.urls);fs.writeFileSync(out,JSON.stringify({scenario:'D',ok:true,profile:folder,killed,before,after,generatedAt:new Date().toISOString()},null,2));console.log('PASS force kill/restart restores all 10 URLs');server.close();
})().catch(error=>{console.error(error);fs.writeFileSync(out,JSON.stringify({scenario:'D',ok:false,error:String(error.stack),profile:folder}));if(child&&!child.killed)try{process.kill(-child.pid,'SIGKILL')}catch{}server.close();process.exitCode=1});
