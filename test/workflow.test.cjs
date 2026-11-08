const test=require('node:test'),assert=require('node:assert/strict');
const {AiService}=require('../dist/ai/service');
const {parseAiCommand}=require('../dist/ai/protocol');
const {AuthService}=require('../dist/auth/service');
const {parseAuthCommand}=require('../dist/auth/protocol');
test('bounded workflow shares only approved task origin, waits for execution approval, recaptures then completes',async()=>{
 let calls=0,acts=0,captures=0,completed=0;
 const adapter={models:async()=>['fixture'],chat:async()=>({text:'step',click:null,action:++calls===1?{op:'FILL',target:'e1',value:'query'}:null,usage:{input:1,output:1,cached:0}})};
 const host={capture:async()=>{captures++;return {data:{source:'task',origin:'https://example.test',text:'page',elements:[{id:'e1',name:'Search',role:'textbox',actions:['FILL']}]},valid:()=>true,check:async()=>true,dispose(){},click:async()=>false,act:async()=>{acts++;return true}}},confirmWorkflow:async()=>true,completed:()=>completed++,openTask:async()=>{},closeTask(){},hide(){}};
 const service=new AiService(adapter,{},host,()=>{});await service.command({type:'connect',provider:'compatible',endpoint:'http://127.0.0.1:1234/v1',key:'',remember:false});
 await service.command({type:'run-task',goal:'Search',steps:3});assert.equal(calls,1);assert.equal(acts,0);assert.equal(service.publicState().proposal.action.op,'FILL');
 await service.command({type:'approve'});assert.equal(acts,1);assert.equal(calls,2);assert.ok(captures>=3);assert.equal(service.publicState().workflow.status,'completed');assert.equal(completed,1);service.dispose();
});
test('workflow refuses origin changes and malformed automation budgets',async()=>{
 let captures=0,calls=0;
 const host={capture:async()=>({data:{source:'task',origin:++captures===1?'https://one.test':'https://two.test',text:'private',elements:[]},valid:()=>true,check:async()=>true,dispose(){},click:async()=>false}),confirmWorkflow:async()=>true,openTask:async()=>{},closeTask(){},hide(){}};
 const service=new AiService({models:async()=>['fixture'],chat:async()=>{calls++;throw Error('unexpected')}},{},host,()=>{});
 await service.command({type:'connect',provider:'compatible',endpoint:'http://127.0.0.1:1234/v1',key:'',remember:false});await service.command({type:'run-task',goal:'task',steps:2});
 assert.equal(calls,0);assert.equal(service.publicState().workflow.status,'paused');service.dispose();
 assert.equal(parseAiCommand({type:'run-task',goal:'x',steps:100}),null);assert.equal(parseAiCommand({type:'run-task',goal:'x',steps:1,approved:true}),null);
});
test('password recovery binds PKCE callback to email; password update requires a session and logs out afterwards',async()=>{
 let callback,calls=[];const email='fixture@example.test',id='11111111-1111-4111-8111-111111111111';
 const session={access_token:'fixture-access-token-not-live',refresh_token:'fixture-refresh',expires_in:3600,token_type:'bearer',user:{id,email,email_confirmed_at:new Date().toISOString()}};
 const api={request:async(route,body,_signal,query,bearer)=>{calls.push({route,body,query,bearer});if(route==='recover')return {};if(route==='token')return session;if(route==='user')return {id,email};return null}};
 const service=new AuthService(api,()=>{},()=>({start:async fn=>{callback=fn;return 'http://127.0.0.1:52149/auth/callback'},close(){}}));
 await service.command({type:'password-update',password:'new-fixture-password',currentPassword:'',nonce:''});assert.equal(calls.length,0);
 await service.command({type:'recover',email});assert.equal(calls[0].route,'recover');assert.equal(typeof calls[0].body.code_challenge,'string');assert.equal('password' in calls[0].body,false);
 assert.equal(await callback('fixture-auth-code'),true);assert.equal(service.publicState().recovering,true);
 await service.command({type:'password-update',password:'new-fixture-password',currentPassword:'',nonce:''});assert.equal(service.publicState().status,'signed-out');assert.equal(calls.at(-1).route,'logout');assert.equal(JSON.stringify(service.publicState()).includes('new-fixture-password'),false);service.dispose();
 assert.equal(parseAuthCommand({type:'recover',email,redirect:'https://evil.test'}),null);assert.equal(parseAuthCommand({type:'password-update',password:'short',currentPassword:'',nonce:''}),null);
});
