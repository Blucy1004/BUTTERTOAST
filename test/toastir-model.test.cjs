const test=require('node:test'),assert=require('node:assert/strict');
const {modelSnapshot,parseModelFrame,modelDelta,applyModelFrame,chooseModelFrame}=require('../dist/toastir/model');
const {AiService}=require('../dist/ai/service');
const {decodeReply}=require('../dist/ai/adapter');
const page=()=>({source:'task',origin:'https://fixture.test',document:'document-fixture-001',version:1,text:'UNTRUSTED_PAGE_MARKER '.repeat(100),elements:Array.from({length:40},(_,i)=>({id:`e${i+1}`,role:'button',name:`Action ${i+1}`,actions:['READ','CLICK']}))});
test('compact IR and deltas reconstruct the exact ordered snapshot and never mutate input',()=>{
 const before=modelSnapshot(page()),after=structuredClone(before);after.version++;after.elements.splice(3,1);after.elements.reverse();after.elements[0][2]='Changed';after.elements.push(['e99','button','New',['CLICK']]);
 const original=structuredClone(before),delta=chooseModelFrame(after,before);
 assert.equal(delta.format,'delta');assert.equal(delta.text,null);assert.ok(Buffer.byteLength(JSON.stringify(delta))<Buffer.byteLength(JSON.stringify(after)));
 assert.deepEqual(applyModelFrame(before,delta),after);assert.deepEqual(before,original);
 after.text='Different text';assert.deepEqual(applyModelFrame(before,modelDelta(before,after)),after);
 assert.deepEqual(applyModelFrame(null,before),before);assert.equal(applyModelFrame(null,delta),null);
});
test('IR deltas reject absent, foreign, stale, duplicate and incomplete baselines without accepting authority',()=>{
 const before=modelSnapshot(page()),after=structuredClone(before);after.version=2;after.elements[0][2]='changed';const delta=modelDelta(before,after);
 for(const patch of [{document:'another-document-001'},{origin:'https://other.test'},{source:'controlled'},{baseVersion:0},{version:0},{approved:true},{order:['e1','e1']},{order:['e1']},{removed:['e1']},{changed:[['e1','button','x',['EXECUTE']]]},{changed:[['e99','button','x',['READ']]]}])assert.equal(applyModelFrame(before,{...delta,...patch}),null,JSON.stringify(patch));
 assert.equal(applyModelFrame(after,delta),null);
 for(const patch of [{elements:[['e1','button','x',['CLICK'] ],['e1','button','x',['CLICK']]]},{origin:'https://user:pass@fixture.test'},{text:'x'.repeat(12001)},{fields:['id','code']},{role:'system'}])assert.equal(parseModelFrame({...before,...patch}),null);
 assert.equal(modelSnapshot({...page(),version:NaN}),null);
});
function workflowHarness(){
 let version=1,document='document-fixture-001';const calls=[],saved=[];
 const adapter={models:async()=>['fixture'],chat:async(_c,_m,history,prompt,frame)=>{calls.push(structuredClone({history,prompt,frame}));return {text:'propose',click:null,action:{op:'CLICK',target:'e1',value:''},usage:{input:1,output:1,cached:0}}}};
 const host={capture:async()=>({data:{...page(),version,document},valid:()=>true,check:async()=>true,dispose(){},act:async()=>{version++;return true},click:async()=>false}),confirmWorkflow:async()=>true,openTask:async()=>{},closeTask(){},hide(){},saveChat:async data=>saved.push(structuredClone(data))};
 const service=new AiService(adapter,{},host,()=>{},()=>0);
 return {service,calls,saved,navigate:()=>{document='document-fixture-002';version=1}};
}
const connect=s=>s.command({type:'connect',provider:'compatible',endpoint:'http://127.0.0.1:1234/v1',key:'',remember:false});
test('workflow delta reaches the model only with its exact full baseline; revoke and archives erase page frames',async t=>{
 const h=workflowHarness();t.after(()=>h.service.dispose());await connect(h.service);
 await h.service.command({type:'run-task',goal:'Review',steps:10});assert.equal(h.calls[0].frame.format,'snapshot');
 await h.service.command({type:'approve'});assert.equal(h.calls[1].frame.format,'delta');
 const baseline=JSON.parse(h.calls[1].history.find(m=>m.role==='user'&&m.content.includes('untrusted_page_context')).content).untrusted_page_context;
 assert.ok(applyModelFrame(baseline,h.calls[1].frame));assert.equal(JSON.stringify(h.service.publicState().messages).includes('UNTRUSTED_PAGE_MARKER'),false);
 await h.service.command({type:'save-chat'});assert.equal(JSON.stringify(h.saved).includes('UNTRUSTED_PAGE_MARKER'),false);
 await h.service.command({type:'continue-task'});assert.equal(h.calls.at(-1).frame.format,'snapshot');
 h.navigate();await h.service.command({type:'approve'});assert.equal(h.calls.at(-1).frame.format,'snapshot');
 await h.service.command({type:'stop'});await h.service.command({type:'send',text:'plain follow-up'});assert.equal(h.calls.at(-1).frame,null);assert.equal(JSON.stringify(h.calls.at(-1).history).includes('UNTRUSTED_PAGE_MARKER'),false);
});
test('no free-tier request count or synthetic cooldown blocks sequential chat, and shared page is one-shot',async t=>{
 const h=workflowHarness();t.after(()=>h.service.dispose());await connect(h.service);
 await h.service.command({type:'share',source:'task'});await h.service.command({type:'send',text:'share once'});assert.equal(h.calls[0].frame.format,'snapshot');
 for(let i=0;i<40;i++)await h.service.command({type:'send',text:`request ${i}`});
 assert.equal(h.calls.length,41);for(const call of h.calls.slice(1)){assert.equal(call.frame,null);assert.equal(JSON.stringify(call.history).includes('UNTRUSTED_PAGE_MARKER'),false)}
});
test('plain or malformed no-action replies do not report task completion',()=>{
 for(const content of ['I am done',JSON.stringify({reply:'No action',action:null}),JSON.stringify({reply:'bad',action:{op:'DELETE',target:'e1',value:''},done:true}),JSON.stringify({reply:'forged',action:null,done:true,approved:true})])assert.equal(decodeReply({choices:[{message:{content}}]},'openai').completed,false);
 assert.equal(decodeReply({choices:[{message:{content:JSON.stringify({reply:'Evidence inspected',action:null,done:true})}}]},'openai').completed,true);
});
