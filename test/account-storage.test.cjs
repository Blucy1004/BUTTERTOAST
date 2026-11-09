const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {randomBytes,createCipheriv,createDecipheriv}=require('node:crypto');
const {AccountStorage,parseRemembered}=require('../dist/auth/storage');
const {AuthService}=require('../dist/auth/service'),{parseAuthCommand}=require('../dist/auth/protocol');
const {defaultProfile,PROFILE_KEY}=require('../dist/profile/model');
const id='11111111-1111-4111-8111-111111111111',email='fixture@example.test',refresh='fixture-refresh-for-storage';
const remote={...defaultProfile(),name:'Remote'},local={...defaultProfile(),name:'Local'};
const token=()=>({access_token:'fixture-access-never-persisted',refresh_token:refresh,expires_in:3600,token_type:'bearer',user:{id,email,email_confirmed_at:'2026-11-08T00:00:00Z',user_metadata:{[PROFILE_KEY]:remote}}});
function cipher(){const key=randomBytes(32);return {available:()=>true,encrypt:text=>{const iv=randomBytes(12),c=createCipheriv('aes-256-gcm',key,iv),body=Buffer.concat([c.update(text),c.final()]);return Buffer.concat([iv,c.getAuthTag(),body])},decrypt:bytes=>{const c=createDecipheriv('aes-256-gcm',key,bytes.subarray(0,12));c.setAuthTag(bytes.subarray(12,28));return Buffer.concat([c.update(bytes.subarray(28)),c.final()]).toString()}}}
async function storage(t,adapter=cipher()){const dir=await fs.mkdtemp(path.join(os.tmpdir(),'bt-account-storage-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));const store=new AccountStorage(dir,adapter);await store.load();return {dir,store,adapter};}
test('account customization stays local until explicit per-account sync opt-in, and disabling stops profile traffic',async t=>{
 const {store}=await storage(t),calls=[];let now=Date.now();
 const service=new AuthService({request:async(...args)=>{calls.push(args);return args[0]==='token'?token():token().user}},()=>{},undefined,()=>now,store);t.after(()=>service.dispose());
 await service.command({type:'login',email,password:'fixture-password'});assert.equal(service.publicState().syncEnabled,false);assert.equal(service.publicState().profile.name,'');
 await service.command({type:'profile-save',revision:service.publicState().profileRevision,profile:local});assert.equal(calls.length,1);assert.equal(service.publicState().profile.name,'Local');
 await service.command({type:'profile-sync',revision:service.publicState().profileRevision,enabled:true});assert.equal(calls.at(-1)[0],'user');assert.equal(calls.at(-1)[1],null);assert.equal(service.publicState().profile.name,'Remote');
 await service.command({type:'profile-sync',revision:service.publicState().profileRevision,enabled:false});now+=2000;const before=calls.length;
 await service.command({type:'profile-save',revision:service.publicState().profileRevision,profile:local});assert.equal(calls.length,before);assert.equal(store.profile(id).sync,false);
 await store.flush();assert.equal((await store.loadSession()),null);
});
test('remembered login stores only encrypted refresh credentials and revalidates the same user on startup',async t=>{
 const {dir,store,adapter}=await storage(t);const api={request:async()=>token()};
 const service=new AuthService(api,()=>{},undefined,Date.now,store);t.after(()=>service.dispose());
 await service.command({type:'login',email,password:'fixture-password',remember:true});await store.flush();assert.equal(service.publicState().remembered,true);
 const bytes=await fs.readFile(path.join(dir,'session.enc'));assert.equal(bytes.includes(refresh),false);const plaintext=adapter.decrypt(bytes);assert.equal(plaintext.includes(token().access_token),false);assert.equal(plaintext.includes('fixture-password'),false);
 service.dispose();const restored=new AuthService(api,()=>{},undefined,Date.now,store);t.after(()=>restored.dispose());await restored.restoreRemembered();assert.equal(restored.publicState().status,'signed-in');assert.equal(JSON.stringify(restored.publicState()).includes(refresh),false);
 await restored.command({type:'logout'});await store.flush();assert.equal(await store.loadSession(),null);assert.ok(await fs.stat(path.join(dir,'profiles.enc')));
});
test('foreign refresh response and late restoration after logout cannot revive a saved account',async t=>{
 for(const mode of ['foreign','late']){
  const {store}=await storage(t);await store.saveSession({id,email,refresh});let release;
  const service=new AuthService({request:()=>mode==='late'?new Promise(r=>release=r):Promise.resolve({...token(),user:{...token().user,id:'22222222-2222-4222-8222-222222222222'}})},()=>{},undefined,Date.now,store);t.after(()=>service.dispose());
  const pending=service.restoreRemembered();if(mode==='late'){while(!release)await new Promise(r=>setImmediate(r));await service.command({type:'logout'});release(token());}
  await pending;await store.flush();assert.equal(service.publicState().status,'signed-out');assert.equal(await store.loadSession(),null);
 }
});
test('logout deletion wins over pending OS encryption and never erases separate customization',async t=>{
 let release;const adapter=cipher(),original=adapter.encrypt;adapter.encrypt=text=>text.includes('"refresh"')?new Promise(resolve=>release=()=>resolve(original(text))):original(text);
 const {store}=await storage(t,adapter);await store.saveProfile(id,{profile:local,sync:false});
 const writing=store.saveSession({id,email,refresh});while(!release)await new Promise(r=>setImmediate(r));const clearing=store.saveSession(null);release();await writing;await clearing;
 assert.equal(await store.loadSession(),null);assert.equal(store.profile(id).profile.name,'Local');
});
test('OS storage failure never writes plaintext, and old-device confirmation cannot target a later session',async t=>{
 const {dir,store}=await storage(t,{available:()=>false,encrypt:()=>{throw Error('must not encrypt')},decrypt:()=>{throw Error('must not decrypt')}});await assert.rejects(store.saveSession({id,email,refresh}));await assert.rejects(fs.stat(path.join(dir,'session.enc')),{code:'ENOENT'});
 let resolve,now=Date.now();const calls=[];const service=new AuthService({request:async(...args)=>{calls.push(args);return args[0]==='token'?token():null}},()=>{},undefined,()=>now,store);t.after(()=>service.dispose());
 await service.command({type:'login',email,password:'fixture-password',remember:true});assert.equal(service.publicState().remembered,false);
 const pending=service.confirmLogoutOthers(()=>new Promise(r=>resolve=r));await service.command({type:'logout'});now+=4000;await service.command({type:'login',email,password:'fixture-password'});resolve(true);await pending;assert.equal(calls.some(c=>c[3]==='?scope=others'),false);
 await service.confirmLogoutOthers(async()=>true);assert.equal(calls.at(-1)[3],'?scope=others');assert.equal(service.publicState().status,'signed-in');
 for(const data of [{id,email,refresh,access:'injected'},{id:'other',email,refresh},{id,email,refresh:'bad\n'}])assert.equal(parseRemembered(data),null);
 assert.equal(parseAuthCommand({type:'login',email,password:'fixture',remember:'true'}),null);assert.equal(parseAuthCommand({type:'profile-sync',revision:'22222222-2222-4222-8222-222222222222',enabled:true,userId:id}),null);
});
test('hard expiry removes remembered credentials and late refresh cannot restore them',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});const {store}=await storage(t);let release;
 const service=new AuthService({request:async(_r,_b,_s,query)=>query==='?grant_type=password'?{...token(),expires_in:1}:new Promise(resolve=>release=resolve)},()=>{},undefined,Date.now,store);t.after(()=>service.dispose());
 await service.command({type:'login',email,password:'fixture-password',remember:true});await store.flush();assert.ok(await store.loadSession());
 t.mock.timers.tick(500);assert.equal(typeof release,'function');t.mock.timers.tick(500);await store.flush();assert.equal(service.publicState().status,'signed-out');assert.equal(await store.loadSession(),null);
 release(token());await new Promise(resolve=>setImmediate(resolve));await store.flush();assert.equal(await store.loadSession(),null);assert.equal(service.publicState().status,'signed-out');
});
test('failure to replace remembered credentials also removes the previous remembered identity',async t=>{
 const {store,adapter}=await storage(t);await store.saveSession({id,email,refresh});const encrypt=adapter.encrypt;
 adapter.encrypt=text=>text.includes('"refresh"')?Promise.reject(new Error('fixture encryption failure')):encrypt(text);
 const service=new AuthService({request:async()=>token()},()=>{},undefined,Date.now,store);t.after(()=>service.dispose());
 await service.command({type:'login',email,password:'fixture-password',remember:true});await store.flush();await new Promise(resolve=>setImmediate(resolve));await store.flush();
 assert.equal(service.publicState().status,'signed-in');assert.equal(service.publicState().remembered,false);assert.equal(await store.loadSession(),null);
});
