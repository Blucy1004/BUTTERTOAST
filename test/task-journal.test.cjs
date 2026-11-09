const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
const {TaskJournal,parseTaskRecords}=require('../dist/ai/task-journal');
function cipher(){const key=crypto.randomBytes(32);return {available:()=>true,encrypt:text=>{const iv=crypto.randomBytes(12),c=crypto.createCipheriv('aes-256-gcm',key,iv),b=Buffer.concat([c.update(text,'utf8'),c.final()]);return Buffer.concat([iv,c.getAuthTag(),b]);},decrypt:b=>{const c=crypto.createDecipheriv('aes-256-gcm',key,b.subarray(0,12));c.setAuthTag(b.subarray(12,28));return Buffer.concat([c.update(b.subarray(28)),c.final()]).toString();}};}
test('protected task history survives reload, bounds metadata, interrupts incomplete work and never stores arbitrary content',async t=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'bt-journal-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));const file=path.join(dir,'tasks.enc'),c=cipher(),j=new TaskJournal(file,c);await j.load();
 const id=j.create(1,'draft');j.apply(id,{type:'running',origin:'https://example.test',step:1});j.apply(id,{type:'step',operation:'FILL',outcome:'dispatched',step:1,value:'SECRET_INPUT',key:'PRIVATE_API_KEY'});j.apply(id,{type:'awaiting-approval'});await j.flush();
 const bytes=await fs.readFile(file);assert.equal(bytes.includes(Buffer.from('example.test')),false);const plain=c.decrypt(bytes);assert.doesNotMatch(plain,/SECRET_INPUT|PRIVATE_API_KEY|value|goal/);
 const loaded=new TaskJournal(file,c);await loaded.load();assert.equal(loaded.snapshot()[0].status,'interrupted');assert.equal(loaded.snapshot()[0].reason,'restored');assert.equal(loaded.snapshot()[0].steps[0].operation,'FILL');
 const copy=loaded.snapshot();copy[0].origin='https://changed.test';assert.equal(loaded.snapshot()[0].origin,'https://example.test');
 const bad={version:1,records:loaded.snapshot()};bad.records[0].goal='secret';assert.equal(parseTaskRecords(bad),null);
 for(let i=0;i<105;i++)loaded.create(2,'draft');await loaded.flush();assert.equal(loaded.snapshot().length,100);assert.deepEqual((await fs.readdir(dir)).filter(n=>n.endsWith('.tmp')),[]);
});
test('unavailable or corrupt protected history never creates plaintext or overwrites damaged data',async t=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'bt-journal-fail-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));const file=path.join(dir,'tasks.enc');
 const unavailable=new TaskJournal(file,{available:()=>false,encrypt:()=>{throw Error('must not encrypt');}});await unavailable.load();unavailable.create(1,'draft');await unavailable.flush();await assert.rejects(fs.access(file));assert.equal(unavailable.status,'unavailable');
 await fs.writeFile(file,'damaged existing protected record');const broken=new TaskJournal(file,cipher());await broken.load();broken.create(1,'draft');await broken.flush();assert.equal(broken.status,'failed');assert.equal(await fs.readFile(file,'utf8'),'damaged existing protected record');
});
