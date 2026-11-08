const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { randomBytes, createCipheriv, createDecipheriv } = require('node:crypto');
const { parseSession, TabSessionStore } = require('../dist/browser/session-store');
const { shouldBlockTracker, privateHeaders } = require('../dist/browser/privacy-policy');
const { parseCommand } = require('../dist/security/ipc');
const sample = { version: 1, active: 0, tabs: ['https://example.test/path?private=value'] };
// Test cipher checks persistence plumbing only; it is NOT the product OS storage adapter.
function testCipher() {
  const key = randomBytes(32);
  return {
    available: () => true,
    encrypt(value) { const iv=randomBytes(12), c=createCipheriv('aes-256-gcm',key,iv); const body=Buffer.concat([c.update(value,'utf8'),c.final()]); return Buffer.concat([iv,c.getAuthTag(),body]); },
    decrypt(value) { const c=createDecipheriv('aes-256-gcm',key,value.subarray(0,12)); c.setAuthTag(value.subarray(12,28)); return Buffer.concat([c.update(value.subarray(28)),c.final()]).toString('utf8'); }
  };
}
async function setup(t) { const dir=await fs.mkdtemp(path.join(os.tmpdir(),'bt-session-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));return path.join(dir,'session.enc'); }
test('session restore accepts only bounded URL snapshots and copies caller data', () => {
  const copy=parseSession(sample); copy.tabs.push(''); assert.equal(sample.tabs.length,1);
  for(const bad of [{...sample,approved:true},{...sample,active:-1},{...sample,active:1},{...sample,tabs:[]},{...sample,tabs:Array(31).fill('')},{...sample,tabs:Array(1)},{...sample,version:2}])assert.equal(parseSession(bad),null);
  for(const url of ['file:///etc/passwd','javascript:alert(1)','https://u:p@example.test','https://example.test/\n','https://example.test/'+ 'x'.repeat(4096),null])assert.equal(parseSession({...sample,tabs:[url]}),null);
  assert.ok(parseSession({...sample,tabs:['','http://localhost/']}));
});
test('session persistence has no plaintext fallback or secret-bearing errors', async t => {
  const file=await setup(t), cipher=testCipher();let encryptions=0;
  const unavailable=new TabSessionStore(file,{...cipher,available:()=>false,encrypt:()=>{encryptions++;throw Error('secret')}});
  assert.equal(await unavailable.load(),null);await unavailable.save(sample);assert.equal(encryptions,0);await assert.rejects(fs.stat(file),{code:'ENOENT'});
  const store=new TabSessionStore(file,cipher);assert.equal(await store.load(),null);await store.save(sample);
  assert.equal((await fs.readFile(file)).includes('private=value'),false);
  assert.deepEqual(await new TabSessionStore(file,cipher).load(),sample);
  if(process.platform!=='win32')assert.equal((await fs.stat(file)).mode & 0o777,0o600);
  const broken=new TabSessionStore(file,{...cipher,decrypt:()=>{throw Error('sensitive-value')}});assert.equal(await broken.load(),null);assert.equal(broken.status,'failed');
});
test('overlapping saves retain the latest detached snapshot, including at shutdown', async t => {
  const file=await setup(t), cipher=testCipher();let release;const gate=new Promise(r=>{release=r});let first=true;
  const store=new TabSessionStore(file,{...cipher,encrypt:async value=>{if(first){first=false;await gate}return cipher.encrypt(value)}});
  await store.load();const pending=store.save(sample);const latest={version:1,active:1,tabs:['https://a.test/','https://b.test/']};store.save(latest);latest.tabs[1]='https://attacker.test/';
  release();await store.flush();await pending;assert.deepEqual(await new TabSessionStore(file,cipher).load(),{version:1,active:1,tabs:['https://a.test/','https://b.test/']});
  assert.deepEqual(await fs.readdir(path.dirname(file)),['session.enc']);
});
test('corrupt, oversized and unwritable session files fail closed', async t => {
  const file=await setup(t),cipher=testCipher();
  for(const data of [Buffer.from('not ciphertext'),cipher.encrypt(JSON.stringify({...sample,tabs:['file:///secret']})),Buffer.alloc(512*1024+1)]){
    await fs.writeFile(file,data);const store=new TabSessionStore(file,cipher);assert.equal(await store.load(),null);assert.equal(store.status,'failed');
  }
  const bad=new TabSessionStore(path.join(file,'child'),cipher);await bad.load();await bad.save(sample);assert.equal(bad.status,'failed');
});
test('encrypted session version two restores pinned and muted state without executing or storing page content',async t=>{
 const file=await setup(t),cipher=testCipher(),store=new TabSessionStore(file,cipher);await store.load();
 const value={version:2,active:1,tabs:[{url:'https://example.test/?private=value',pinned:true,muted:true},{url:'',pinned:false,muted:false}]};
 await store.save(value);assert.equal((await fs.readFile(file)).includes('private=value'),false);assert.deepEqual(await new TabSessionStore(file,cipher).load(),value);
});
test('tracker matching respects host boundaries and leaves first-party/main navigation working', () => {
  for(const host of ['google-analytics.com','sub.google-analytics.com','google-analytics.com.'])assert.equal(shouldBlockTracker(`https://${host}/collect`,'https://example.test/','xhr'),true);
  for(const host of ['evilgoogle-analytics.com','google-analytics.com.evil.test'])assert.equal(shouldBlockTracker(`https://${host}/`,'https://example.test/','script'),false);
  assert.equal(shouldBlockTracker('https://doubleclick.net/','https://example.test/','mainFrame'),false);
  assert.equal(shouldBlockTracker('https://doubleclick.net/','https://sub.doubleclick.net/','script'),false);
  assert.equal(shouldBlockTracker('https://doubleclick.net/','','xhr'),false);
  assert.equal(shouldBlockTracker('wss://doubleclick.net/socket','https://example.test/','webSocket'),true);
});
test('privacy headers minimize cross-origin referrers while preserving auth and origin', () => {
  const original={Referer:'https://a.test/private?token=value',Origin:'https://a.test',Authorization:'test-value',Cookie:'session=value','sec-gpc':'0',dnt:'0'};
  const headers=privateHeaders('https://b.test/',original);
  assert.equal(headers.Referer,'https://a.test/');assert.equal(headers['Sec-GPC'],'1');assert.equal(headers.DNT,'1');assert.equal(headers['sec-gpc'],undefined);assert.equal(headers.dnt,undefined);
  for(const key of ['Origin','Authorization','Cookie'])assert.equal(headers[key],original[key]);
  assert.equal(original.Referer,'https://a.test/private?token=value');
  assert.equal(privateHeaders('https://a.test/path',original).Referer,original.Referer);
  assert.equal(privateHeaders('http://b.test/',original).Referer,undefined);
  assert.equal(privateHeaders('https://b.test/',{Referer:'not a url'}).Referer,undefined);
});
test('new tab management IPC rejects extra authority, arbitrary sites and movement amounts', () => {
  for(const type of ['reopen','restart','suspend','stop','privacy-toggle']){
    assert.deepEqual(parseCommand({type}),{type});assert.equal(parseCommand({type,origin:'https://target.test'}),null);
  }
  assert.deepEqual(parseCommand({type:'move',id:1,delta:-1}),{type:'move',id:1,delta:-1});
  for(const bad of [{type:'move',id:1,delta:3},{type:'move',id:-1,delta:1},{type:'move',id:1,delta:1,approved:true}])assert.equal(parseCommand(bad),null);
});
