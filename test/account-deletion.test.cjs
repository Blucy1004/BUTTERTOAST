const test=require('node:test'),assert=require('node:assert/strict');
const id='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222',key='fixture-server-only-key',bearer='fixture-user-bearer-token';
const user={id,email:'fixture@example.test',email_confirmed_at:'2026-11-08T00:00:00Z'};
const request=(body={confirmation:'DELETE',password:'fixture-password'},headers={})=>new Request('https://fixture.test/functions/v1/delete-account',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${bearer}`,...headers},body:JSON.stringify(body)});
test('deletion function derives the target from verified auth identity, reauthenticates and never returns credentials',async()=>{
 const {deletionHandler}=await import('../supabase/functions/delete-account/handler.mjs');const calls=[];
 const handler=deletionHandler({origin:'https://project.supabase.co',serviceKey:key,fetcher:async(url,options)=>{calls.push({url,options});return url.endsWith('/user')?Response.json(user):url.includes('/token?')?Response.json({user,access_token:'fixture-reauth-access'}):new Response(null,{status:204})}});
 const response=await handler(request());assert.equal(response.status,200);const result=await response.text();for(const secret of [bearer,key,'fixture-password'])assert.equal(result.includes(secret),false);
 assert.ok(calls.some(c=>c.url.endsWith(`/admin/users/${id}`)&&c.options.method==='DELETE'));assert.ok(calls.every(c=>c.options.redirect==='error'&&c.options.credentials==='omit'));
 assert.equal(calls.at(-1).url,'https://project.supabase.co/auth/v1/logout?scope=local');
});
test('foreign target injection, wrong fresh identity, missing auth, browser CSRF and backend errors cannot delete an account',async()=>{
 const {deletionHandler}=await import('../supabase/functions/delete-account/handler.mjs');
 for(const mode of ['injected','foreign','unauthorized','origin','bad-password','delete-failure']){
  const calls=[];const handler=deletionHandler({origin:'https://project.supabase.co',serviceKey:key,fetcher:async(url,options)=>{calls.push({url,options});if(url.endsWith('/user'))return Response.json(user);if(url.includes('/token?'))return mode==='bad-password'?new Response(null,{status:403}):Response.json({user:mode==='foreign'?{...user,id:other}:user,access_token:'fixture-fresh-access'});return new Response(null,{status:mode==='delete-failure'?500:204})}});
  const response=await handler(request(mode==='injected'?{confirmation:'DELETE',password:'fixture-password',userId:other}:undefined,mode==='unauthorized'?{Authorization:''}:mode==='origin'?{Origin:'https://attacker.test'}:{}));
  assert.notEqual(response.status,200);assert.equal(calls.some(c=>c.url.endsWith(`/admin/users/${other}`)),false);if(mode!=='delete-failure')assert.equal(calls.some(c=>c.options.method==='DELETE'),false);
 }
});
