const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {defaultProfile,defaultAppearance,parseProfile,parseAppearance,profileFromUser,PROFILE_KEY}=require('../dist/profile/model');
const {parseAuthCommand}=require('../dist/auth/protocol');
const {AuthService}=require('../dist/auth/service');
const {AuthApi}=require('../dist/auth/api');
const {BrowserLibrary,parseLibrary}=require('../dist/browser/library');
const email='profile@example.test',id='11111111-1111-4111-8111-111111111111';
const profile=()=>({...defaultProfile(),name:'새벽 여행자',bio:'나만의 브라우저',avatar:'sun',appearance:{...defaultAppearance(),theme:'light',accent:'violet'}});
const user=(p=profile(),extra={})=>({id,email,email_confirmed_at:'2026-11-08T00:00:00Z',user_metadata:{[PROFILE_KEY]:p,external_role:'admin',unrelated:'preserved-on-server'},...extra});
const token=(u=user())=>({access_token:'fixture-access-profile-not-live',refresh_token:'fixture-refresh-not-live',expires_in:3600,token_type:'bearer',user:u});
function harness(handler){let now=Date.now();const calls=[];const service=new AuthService({request:async(...args)=>{calls.push(args);return handler(...args)}},()=>{},undefined,()=>now,{available:false,profile:()=>({profile:defaultProfile(),sync:true}),saveProfile:async()=>{},saveSession:async()=>{},loadSession:async()=>null,flush:async()=>{}});return {service,calls,advance:()=>now+=61000};}
const login=h=>h.service.command({type:'login',email,password:'fixture-password'});
const save=(h,p=profile())=>h.service.command({type:'profile-save',revision:h.service.publicState().profileRevision,profile:p});

test('profile and appearance schemas accept only bounded presentation data, never authority, URLs or CSS',()=>{
 assert.deepEqual(parseProfile(profile()),profile());
 for(const value of [{...profile(),role:'admin'},{...profile(),avatar:'https://evil.test/avatar.svg'},{...profile(),name:'owner\u202eexe'},{...profile(),name:'x'.repeat(33)},{...profile(),bio:'x'.repeat(161)},{...profile(),appearance:{...defaultAppearance(),theme:'light;url(https://evil.test)'}},{...profile(),appearance:{...defaultAppearance(),approved:true}},Object.create(profile())])assert.equal(parseProfile(value),null);
 assert.equal(parseAppearance({...defaultAppearance(),accent:'url(file:///etc/passwd)'}),null);
 const p=profile();p.name='새벽';assert.equal(parseProfile(p).name,'새벽');
 assert.deepEqual(profileFromUser({user_metadata:{[PROFILE_KEY]:{version:999,role:'admin'}}}).profile,defaultProfile());
 assert.ok(profileFromUser({user_metadata:{[PROFILE_KEY]:{version:999}}}).warning);
});
test('profile IPC binds edits to a revision and rejects caller identities, bearer tokens and injected fields',()=>{
 const revision='22222222-2222-4222-8222-222222222222',command={type:'profile-save',revision,profile:profile()};
 assert.ok(parseAuthCommand(command));assert.ok(parseAuthCommand({type:'profile-reload',revision}));
 for(const bad of [{...command,userId:id},{...command,bearer:'fixture'},{...command,revision:''},{...command,profile:{...profile(),permissions:['admin']}},{type:'profile-reload',revision,url:'https://evil.test'}])assert.equal(parseAuthCommand(bad),null);
 const parsed=parseAuthCommand(command);command.profile.name='MUTATED';assert.equal(parsed.profile.name,'새벽 여행자');
});
test('profile transport uses the fixed authenticated user endpoint and distinguishes GET from PUT',async()=>{
 const calls=[],api=new AuthApi({origin:'https://abcdefghijklmnopqrst.supabase.co',publishableKey:'sb_publishable_fixture'},async(url,options)=>{calls.push({url,options});return Response.json(user());});
 await api.request('user',null,AbortSignal.timeout(1000),'','fixture-bearer');await api.request('user',{data:{[PROFILE_KEY]:profile()}},AbortSignal.timeout(1000),'','fixture-bearer');
 assert.deepEqual(calls.map(c=>c.options.method),['GET','PUT']);assert.equal(calls[0].options.body,undefined);
 for(const {url,options} of calls){assert.equal(url,'https://abcdefghijklmnopqrst.supabase.co/auth/v1/user');assert.equal(options.headers.Authorization,'Bearer fixture-bearer');assert.equal(options.redirect,'error');assert.equal(options.credentials,'omit');}
 assert.deepEqual(Object.keys(JSON.parse(calls[1].options.body)),['data']);
});
test('confirmed sign-in imports only a detached profile and logout erases all account customization state',async()=>{
 const h=harness(route=>route==='logout'?null:token());
 try{await login(h);const state=h.service.publicState();assert.deepEqual(state.profile,profile());assert.equal(JSON.stringify(state).includes('external_role'),false);assert.equal(JSON.stringify(state).includes('fixture-access'),false);state.profile.appearance.theme='dark';assert.equal(h.service.publicState().profile.appearance.theme,'light');await h.service.command({type:'logout'});assert.equal(h.service.publicState().profile,null);assert.equal(h.service.publicState().profileRevision,'');assert.equal(h.service.publicState().email,'');}finally{h.service.dispose()}
});
test('profile saves use only the current account bearer and survive metadata property reordering',async()=>{
 const h=harness((route,body)=>route==='token'?token():user({...body.data[PROFILE_KEY],appearance:Object.fromEntries(Object.entries(body.data[PROFILE_KEY].appearance).reverse())}));
 try{await login(h);const revision=h.service.publicState().profileRevision;await save(h,{...profile(),name:'저장한 이름'});const request=h.calls.at(-1);assert.equal(request[0],'user');assert.deepEqual(Object.keys(request[1]),['data']);assert.deepEqual(Object.keys(request[1].data),[PROFILE_KEY]);assert.equal(request[4],token().access_token);assert.equal(h.service.publicState().profile.name,'저장한 이름');assert.notEqual(h.service.publicState().profileRevision,revision);}finally{h.service.dispose()}
});
test('foreign, unconfirmed, missing and malformed update responses never become saved profile state',async()=>{
 for(const result of [user(profile(),{id:'22222222-2222-4222-8222-222222222222'}),user(profile(),{email:'other@example.test'}),user(profile(),{email_confirmed_at:null}),user(profile(),{user_metadata:{}}),user({...profile(),appearance:{...defaultAppearance(),accent:'url(https://evil.test)'}})]){
   const h=harness(route=>route==='token'?token():result);
   try{await login(h);const before=h.service.publicState().profileRevision;await save(h,{...profile(),name:'new-name'});assert.equal(h.service.publicState().profileRevision,before);assert.deepEqual(h.service.publicState().profile,profile());assert.equal(h.service.publicState().busy,false);assert.match(h.service.publicState().message,/확인하지 못/);}finally{h.service.dispose()}
 }
});
test('late profile reads and writes after logout cannot overwrite the next account or revive credentials',async()=>{
 for(const action of ['profile-save','profile-reload']){
   let resolve,second=false;
   const secondUser=user({...defaultProfile(),name:'다른 계정'},{id:'22222222-2222-4222-8222-222222222222'});
   const h=harness(route=>route==='token'?token(second?secondUser:user()):route==='logout'?null:new Promise(r=>resolve=r));
   try{
     await login(h);const revision=h.service.publicState().profileRevision;
     const pending=h.service.command(action==='profile-save'?{type:action,revision,profile:profile()}:{type:action,revision});
     await h.service.command({type:'logout'});second=true;h.advance();await login(h);resolve(user());await pending;
     assert.equal(h.service.publicState().profile.name,'다른 계정');const count=h.calls.length;
     await h.service.command({type:'profile-save',revision,profile:profile()});assert.equal(h.calls.length,count);assert.equal(h.service.publicState().profile.name,'다른 계정');
   }finally{h.service.dispose()}
 }
});
test('profile writes are detached, serialized and bounded; unsigned users cannot read or edit profiles',async()=>{
 let resolve;const h=harness(route=>route==='token'?token():new Promise(r=>resolve=r));
 try{
   await h.service.command({type:'profile-reload',revision:'22222222-2222-4222-8222-222222222222'});assert.equal(h.calls.length,0);
   await login(h);const p=profile(),task=save(h,p);p.appearance.theme='dark';assert.equal(h.calls.at(-1)[1].data[PROFILE_KEY].appearance.theme,'light');
   await save(h);assert.equal(h.calls.length,2);resolve(user());await task;await save(h);assert.equal(h.calls.length,2);
 }finally{h.service.dispose()}
});
test('guest appearance migrates from old library data and is encrypted without persisting an account profile',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'bt-profile-unit-')),file=path.join(dir,'library.enc');let plaintext='';
 const cipher={available:async()=>true,encrypt:async text=>{plaintext=text;return Buffer.from('fixture-encrypted-data')},decrypt:async()=>plaintext};
 try{
   const library=new BrowserLibrary(file,cipher);await library.load();const legacy=library.snapshot();delete legacy.appearance;assert.deepEqual(parseLibrary(legacy).appearance,defaultAppearance());
   library.configureAppearance(profile().appearance);await library.flush();assert.equal((await fs.readFile(file,'utf8')).includes('light'),false);assert.equal(plaintext.includes(PROFILE_KEY),false);assert.equal(plaintext.includes('새벽 여행자'),false);
   const restored=new BrowserLibrary(file,cipher);await restored.load();assert.deepEqual(restored.appearance(),profile().appearance);
   assert.equal(parseLibrary({...restored.snapshot(),appearance:{...profile().appearance,css:'evil'}}),null);
 }finally{await fs.rm(dir,{recursive:true,force:true})}
});
