const {test}=require('node:test'),assert=require('node:assert/strict');
const {parseCommand}=require('../dist/security/ipc');
const {parseAction,ToastGuard}=require('../dist/security/guard');
const {resolveAddress,isWebUrl}=require('../dist/policy');
const {parseSession}=require('../dist/browser/session-store');
const {assetForRequest}=require('../dist/security/ui-protocol');
const {assertSafeSwitches,UNSAFE_SWITCHES}=require('../dist/security/launch-policy');
const {verifyUpdate}=require('../dist/security/update');
const {generateKeyPairSync,sign,createHash}=require('node:crypto');
const base={protocol:2,document:'document_fixture_1234',id:'action',tab:1,origin:'https://fixture.test',version:1,op:'READ',target:'element',value:''};
// Deterministic hostile JSON corpus: failures can be reproduced without a random seed service.
let seed=0x42545452;
function next(){seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return seed>>>0}
function noise(depth=0){const choices=[null,true,false,0,-1,1.5,Number.MAX_SAFE_INTEGER+1,'','__proto__','constructor','https://u:p@fixture.test','\u0000','x'.repeat(4200)];if(depth>2)return choices[next()%choices.length];switch(next()%4){case 0:return Array.from({length:next()%5},()=>noise(depth+1));case 1:return {[['approved','type','protocol','__proto__','origin'][next()%5]]:noise(depth+1)};default:return choices[next()%choices.length]}}
test('10,000 hostile JSON schema mutations fail closed without parser crashes or prototype pollution',()=>{
 for(let i=0;i<10000;i++){
  const value=noise();for(const parse of [parseCommand,parseAction,parseSession])assert.equal(parse(value),null);
  const extra={...base,[`unexpected${i}`]:value};assert.equal(parseAction(extra),null);
  const command={type:'new',approved:value};assert.equal(parseCommand(command),null);
 }
 for(const parse of [parseCommand,parseAction,parseSession])assert.equal(parse(JSON.parse('{"__proto__":{"polluted":true}}')),null);
 assert.equal({}.polluted,undefined);assert.ok(parseAction(base));assert.deepEqual(parseCommand({type:'new'}),{type:'new'});
});
test('2,000 address mutations never return a credentialed or non-web navigation target',()=>{
 const prefixes=['file:','data:','javascript:','vbscript:','chrome:','devtools:','toast-ui:','https://','http://','\\\\','//',''];
 const bodies=['fixture.test','user:secret@fixture.test','fixture.test@attacker.test','[::1]','127.0.0.1','fixture.test/../path','fixture.test/%00','fixture.test\\@attacker.test','fixture.test\u0000','fixture.test\n','fixture.test:443','%2f%2ffixture.test'];
 for(let i=0;i<2000;i++){const input=prefixes[next()%prefixes.length]+bodies[next()%bodies.length];const output=resolveAddress(input);if(output!==null){assert.equal(isWebUrl(output),true,input);const u=new URL(output);assert.equal(u.username,'');assert.equal(u.password,'');assert.ok(['http:','https:'].includes(u.protocol));}}
});
test('UI asset resolver never escapes the exact packaged file set under encoding/path mutations',()=>{
 const allowed=new Set(['index.html','style.css','ui.js','tabs.js','toolbar.js']);
 const paths=['../package.json','%2e%2e/package.json','%252e%252e/package.json','..\\package.json','/%2fetc/passwd','index.html\u0000','index.html?query=1','index.html#hash','%69ndex.html','index.html','foo/../ui.js','style.css'];
 for(const host of ['app','app:99','app.evil','evil@app','app@evil','APP',''])for(const p of paths)for(const method of ['GET','POST','HEAD','PUT']){
  const result=assetForRequest(`toast-ui://${host}/${p}`,method);if(result){assert.equal(method,'GET');assert.ok(allowed.has(result.name));assert.equal(result.name.includes('..'),false);}
 }
 assert.equal(assetForRequest('toast-ui://app:99/index.html','GET'),null);
 assert.equal(assetForRequest('toast-ui://app/index.html','GET').name,'index.html');
});
test('all known unsafe launch switches are rejected without enabling them in Chromium',()=>{
 for(const flag of UNSAFE_SWITCHES)assert.throws(()=>assertSafeSwitches(name=>name===flag),/Unsafe/,flag);
 for(const flag of ['ozone-platform','disable-gpu','site-per-process'])assert.doesNotThrow(()=>assertSafeSwitches(name=>name===flag));
});
test('approval storage cap, expiry and action scope cannot be bypassed by token flooding',()=>{
 let now=0;const guard=new ToastGuard(()=>now),action={...base,op:'CLICK'};
 const state={document:base.document,tab:1,origin:base.origin,version:1,elements:new Map([['element',{visible:true,enabled:true,sensitive:false,actions:new Set(['CLICK'])}]])};
 guard.grant({tab:1,origin:base.origin,permissions:new Set(['read','write','transmit','delete','pay'])});
 const tokens=Array.from({length:32},(_,i)=>guard.approve({...action,id:'op'+i},state));assert.ok(tokens.every(Boolean));assert.equal(new Set(tokens).size,32);
 assert.equal(guard.approve({...action,id:'overflow'},state),null);now=30000;
 assert.equal(guard.claim({...action,id:'op0'},state,tokens[0]).ok,false);const fresh=guard.approve({...action,id:'fresh'},state);assert.ok(fresh);
 assert.equal(guard.claim({...action,id:'fresh',origin:'https://other.test'},state,fresh).ok,false);
 assert.equal(guard.claim({...action,id:'fresh'},state,fresh).ok,true);
});
test('each signed manifest/signature/artifact byte tamper is rejected',()=>{
 const {publicKey,privateKey}=generateKeyPairSync('ed25519'),artifact=Buffer.from('local-test-package');
 const manifest=Buffer.from(JSON.stringify({version:'1.2.4',url:'https://updates.test/app',size:artifact.length,sha256:createHash('sha256').update(artifact).digest('hex'),expires:2000}));
 const signature=sign(null,manifest,privateKey),policy={publisherKey:publicKey,currentVersion:'1.2.3',downloadOrigin:'https://updates.test',now:1000};
 assert.equal(verifyUpdate(manifest,signature,artifact,policy).version,'1.2.4');
 for(const [index,buffer] of [manifest,signature,artifact].entries())for(let i=0;i<buffer.length;i++){
  const corrupt=Buffer.from(buffer);corrupt[i]^=1;const args=[manifest,signature,artifact];args[index]=corrupt;assert.throws(()=>verifyUpdate(...args,policy),/rejected/);
 }
});
