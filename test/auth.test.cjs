const test = require('node:test'), assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const http = require('node:http');
const { parseAuthConfig } = require('../dist/auth/config');
const { parseAuthCommand } = require('../dist/auth/protocol');
const { AuthApi, parseAuthSession } = require('../dist/auth/api');
const { AuthService } = require('../dist/auth/service');
const { ConfirmationListener } = require('../dist/auth/confirmation');
const config = parseAuthConfig('https://abcdefghijklmnopqrst.supabase.co', 'sb_publishable_local_test_fixture_1234');
const email = 'owner@example.test';
const payload = (extra = {}) => ({ access_token: 'fixture_access_value_only', refresh_token: 'fixture_rt12', expires_in: 3600, token_type: 'bearer', user: { id: '11111111-1111-4111-8111-111111111111', email, email_confirmed_at: '2026-11-07T00:00:00Z' }, ...extra });
function harness(handler) {
  let now = Date.now(), callback, closed = 0;
  const states = [], calls = [];
  const service = new AuthService({ request: async (...args) => { calls.push(args); return handler(...args); } }, () => states.push(service.publicState()),
    () => ({ start: async cb => { callback = cb; return 'http://127.0.0.1:52149/auth/callback'; }, close: () => closed++ }), () => now);
  return { service, states, calls, confirm: code => callback(code), advance: () => now += 61000, closed: () => closed };
}
test('account configuration rejects secret keys, alternate hosts, credentials, paths and HTTP', () => {
  assert.ok(config);
  for (const key of ['sb_secret_fixture', 'service_role', 'eyJhbGciOiJIUzI1NiJ9', '', 'sb_publishable_x\n']) assert.equal(parseAuthConfig(config.origin, key), null);
  for (const url of ['http://abcdefghijklmnopqrst.supabase.co', config.origin + '/rest/v1/', config.origin + '?x=1', config.origin + '#x', config.origin + ':444', 'https://a@abcdefghijklmnopqrst.supabase.co', 'https://abcdefghijklmnopqrst.supabase.co.attacker.test']) assert.equal(parseAuthConfig(url, config.publishableKey), null);
});
test('auth IPC enforces exact schema, 8-character signup and bounded unmodified passwords', () => {
  assert.deepEqual(parseAuthCommand({type:'signup', email:' Owner@Example.Test ', password:' 123456 '}), {type:'signup',email,password:' 123456 '});
  for (const value of [{type:'signup',email,password:'1234567'}, {type:'login',email,password:'x',approved:true}, {type:'login',email,password:'x'.repeat(1025)}, {type:'login',email:'a\nb@example.test',password:'a'}, {type:'token',token:'x'}, {type:'logout',scope:'global'}, Object.create({type:'state'})]) assert.equal(parseAuthCommand(value),null);
  assert.ok(parseAuthCommand({type:'login',email,password:'old'}));
});
test('API never follows redirects or accepts oversized, malformed or secret-bearing error bodies', async () => {
  let options;
  for (const response of [new Response(null,{status:302,headers:{Location:'https://attacker.test'}}),new Response('x'.repeat(65537)),new Response('bad json')]) {
    const api = new AuthApi(config,async (url,opts)=>{ assert.equal(new URL(url).origin,config.origin);options=opts;return response; });
    await assert.rejects(api.request('token',{password:'fixture'},AbortSignal.timeout(1000),'?grant_type=password'),/Account request failed/);
    assert.equal(options.redirect,'error');assert.equal(options.credentials,'omit');assert.equal(options.cache,'no-store');
  }
  const api = new AuthApi(config, async()=>new Response(JSON.stringify({message:'secret-token-do-not-echo',error_code:'<script>bad</script>'}),{status:400}));
  await assert.rejects(api.request('token',{},AbortSignal.timeout(1000)),e=>e.code==='credentials'&&!String(e).includes('secret'));
});
test('session parsing requires confirmed expected identity and bounded token lifetime', () => {
  assert.equal(parseAuthSession(payload(),email).email,email);
  for (const value of [payload({user:{...payload().user,email:'other@example.test'}}),payload({user:{...payload().user,email_confirmed_at:null}}),payload({expires_in:Infinity}),payload({expires_in:86401}),payload({access_token:'x'}),payload({user:{...payload().user,id:'-'.repeat(36)}})]) assert.throws(()=>parseAuthSession(value,email));
});
test('signup binds PKCE proof and email, never exposes tokens in public state', async () => {
  const h = harness((route,body)=>route==='signup'?{id:payload().user.id,email}:payload());
  try {
    await h.service.command({type:'signup',email,password:'fixture-password'});
    assert.equal(h.service.publicState().status,'pending-email');
    const request=h.calls[0];assert.equal(request[1].code_challenge_method,'s256');assert.ok(!('code_verifier' in request[1]));
    assert.equal(await h.confirm('fixture-code'),true);
    const verifier=h.calls[1][1].code_verifier;
    assert.equal(createHash('sha256').update(verifier).digest('base64url'),request[1].code_challenge);
    assert.equal(h.service.publicState().status,'signed-in');assert.ok(h.closed());
    const json=JSON.stringify(h.states);for(const value of ['fixture_access',payload().refresh_token,verifier,'fixture-password']) assert.equal(json.includes(value),false);
    await h.service.command({type:'logout'});assert.equal(h.service.publicState().status,'signed-out');
    assert.equal(h.calls.at(-1)[3],'?scope=local');
  } finally {h.service.dispose()}
});
test('foreign-account confirmation and unconfirmed login never establish a session',async()=>{
  const h=harness((route)=>route==='signup'?{id:payload().user.id,email}:payload({user:{...payload().user,email:'attacker@example.test'}}));
  try{await h.service.command({type:'signup',email,password:'fixture-password'});assert.equal(await h.confirm('attacker-code'),false);assert.equal(h.service.publicState().status,'pending-email');}finally{h.service.dispose()}
  const login=harness(()=>payload({user:{...payload().user,email_confirmed_at:null}}));
  try{await login.service.command({type:'login',email,password:'fixture-password'});assert.equal(login.service.publicState().status,'signed-out')}finally{login.service.dispose()}
});
test('logout wins against delayed login and confirmation, even if transport ignores abort',async()=>{
  for(const type of ['login','signup']){
    let resolve;
    const h=harness(route=>route==='signup'?{id:payload().user.id,email}:new Promise(r=>resolve=r));
    try{
      let task=h.service.command({type,email,password:'fixture-password'});
      if(type==='signup'){await task;task=h.confirm('fixture-code')}
      await h.service.command({type:'logout'});resolve(payload());await task;
      assert.equal(h.service.publicState().status,'signed-out');assert.equal(h.service.publicState().email,'');
    }finally{h.service.dispose()}
  }
});
test('overlapping attempts and local retry floods are bounded; logout does not reset rate limit',async()=>{
  let resolve;const h=harness(()=>new Promise(r=>resolve=r));
  try{const task=h.service.command({type:'login',email,password:'fixture-password'});
    await h.service.command({type:'login',email,password:'fixture-password'});assert.equal(h.calls.length,1);
    await h.service.command({type:'logout'});await h.service.command({type:'login',email,password:'fixture-password'});assert.equal(h.calls.length,1);
    resolve(payload());await task;
  }finally{h.service.dispose()}
});
test('refresh cannot resurrect a logged-out session and a changed user id is rejected', async t => {
  t.mock.timers.enable({apis:['setTimeout']});
  let resolve;let calls=0;
  const h=harness((route)=>route==='logout'?null:++calls===1?payload({expires_in:1}):new Promise(r=>resolve=r));
  try{
    await h.service.command({type:'login',email,password:'fixture-password'});t.mock.timers.tick(500);
    await h.service.command({type:'logout'});resolve(payload());await Promise.resolve();await Promise.resolve();
    assert.equal(h.service.publicState().status,'signed-out');
  }finally{h.service.dispose()}
  const other=harness((_route,_body,_signal,query)=>query==='?grant_type=password'?payload({expires_in:1}):payload({user:{...payload().user,id:'22222222-2222-4222-8222-222222222222'}}));
  try{await other.service.command({type:'login',email,password:'fixture-password'});t.mock.timers.tick(500);await Promise.resolve();await Promise.resolve();assert.equal(other.service.publicState().status,'signed-out')}finally{other.service.dispose()}
});
test('loopback receiver rejects hostile Host/Origin/method, ambiguous codes and replay', async()=>{
  const receiver=new ConfirmationListener(0);let received=[];
  const address=await receiver.start(async code=>{received.push(code);return true});
  const request=(suffix,options={})=>new Promise((resolve,reject)=>{const req=http.request(address+suffix,options,res=>{let body='';res.on('data',x=>body+=x);res.on('end',()=>resolve({status:res.statusCode,body,headers:res.headers}))});req.on('error',reject);req.end()});
  try {
    for (const [suffix,options,status] of [['?code=fixture-code',{headers:{Host:'attacker.test'}},403],['?code=fixture-code',{headers:{Origin:'https://attacker.test'}},403],['?code=fixture-code',{method:'POST'},403],['?code=fixture-code&code=other-code',{},400],['?code=fixture-code&next=https://attacker.test',{},400],['?code=%3Cscript%3E',{},400]])assert.equal((await request(suffix,options)).status,status);
    assert.equal(received.length,0);const result=await request('?code=fixture-code');assert.equal(result.status,200);assert.equal(result.body.includes('fixture-code'),false);assert.match(result.headers['content-security-policy'],/default-src 'none'/);assert.deepEqual(received,['fixture-code']);await assert.rejects(request('?code=fixture-code'));
  }finally{receiver.close()}
});
test('malformed signup or server autoconfirm cannot produce a signed-in or pending account',async()=>{
  for(const response of [[],{},payload(),{id:payload().user.id,email:'attacker@example.test'}]){
    const h=harness(()=>response);
    try{await h.service.command({type:'signup',email,password:'fixture-password'});assert.equal(h.service.publicState().status,'signed-out');assert.ok(h.closed())}finally{h.service.dispose()}
  }
});
test('hard session expiry clears login even while refresh transport is stuck',async t=>{
  t.mock.timers.enable({apis:['setTimeout']});let resolve;
  const h=harness((_route,_body,_signal,query)=>query==='?grant_type=password'?payload({expires_in:1}):new Promise(r=>resolve=r));
  try{await h.service.command({type:'login',email,password:'fixture-password'});t.mock.timers.tick(500);assert.equal(typeof resolve,'function');t.mock.timers.tick(500);assert.equal(h.service.publicState().status,'signed-out');resolve(payload());await Promise.resolve();await Promise.resolve();assert.equal(h.service.publicState().status,'signed-out')}finally{h.service.dispose()}
});
test('email wait expires and closes receiver; a disposed service ignores late work',async t=>{
  t.mock.timers.enable({apis:['setTimeout']});const h=harness(()=>({id:payload().user.id,email}));
  try{await h.service.command({type:'signup',email,password:'fixture-password'});t.mock.timers.tick(3600000);assert.equal(h.service.publicState().status,'signed-out');assert.ok(h.closed());assert.equal(await h.confirm('late-confirmation'),false)}finally{h.service.dispose()}
  let resolve;const delayed=harness(()=>new Promise(r=>resolve=r));
  const task=delayed.service.command({type:'login',email,password:'fixture-password'});delayed.service.dispose();resolve(payload());await task;assert.notEqual(delayed.service.publicState().status,'signed-in');
});

test('opaque 12-character Supabase refresh tokens are accepted; malformed values stay rejected', () => {
  const token = 'fixture_rt12';
  assert.equal(token.length, 12);
  assert.equal(parseAuthSession(payload({refresh_token:token}),email).refresh, token);
  for (const refresh_token of ['', ' ', '\n', 'fixture\nrt12', 'x'.repeat(4097), null, 123]) assert.throws(() => parseAuthSession(payload({refresh_token}),email));
});
