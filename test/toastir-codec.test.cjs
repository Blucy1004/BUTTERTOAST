const test=require('node:test'),assert=require('node:assert/strict');
const {encodeIR,decodeIR,diffIR}=require('../dist/toastir/codec');
const {parseProposal}=require('../dist/ai/protocol');
const {ModelAdapter}=require('../dist/ai/adapter');
const {parseOptions,defaultOptions,estimatedCost}=require('../dist/ai/options');
const base=()=>({document:'document_fixture_0001',version:1,origin:'https://example.test',text:'Hello',elements:[{id:'e1',parent:null,role:'button',name:'OK',visible:true,enabled:true,sensitive:false,actions:['CLICK']}]});
test('binary IR roundtrips bounded data and deltas invalidate across documents',()=>{
 const a=base();assert.deepEqual(decodeIR(encodeIR(a)),a);const b=structuredClone(a);b.version++;b.elements[0].name='Changed';b.text='Next';
 assert.deepEqual(diffIR(a,b).changed,b.elements);assert.deepEqual(diffIR(a,{...b,elements:[]}).removed,['e1']);assert.equal(diffIR(a,{...b,document:'different_document_0001'}),null);
 for(const bad of [Buffer.from('evil'),Buffer.concat([Buffer.from('BTIR\x01\xff\xff\xff\xff'),Buffer.from('invalid')])])assert.throws(()=>decodeIR(bad));
 const cycle=base();cycle.elements[0].parent='e1';assert.throws(()=>encodeIR(cycle));const duplicate=base();duplicate.elements.push(duplicate.elements[0]);assert.throws(()=>encodeIR(duplicate));
});
test('model proposals cannot carry authority, execute code, cross origins or exceed operation bounds',()=>{
 for(const action of [{op:'FILL',target:'e1',value:'x',approved:true},{op:'EVAL',target:'',value:'alert(1)'},{op:'NAVIGATE',target:'',value:'https://other.test/'},{op:'WAIT',target:'',value:'5001'},{op:'SCROLL',target:'',value:'Infinity'}])assert.equal(parseProposal(action,'https://example.test'),null);
 assert.ok(parseProposal({op:'FILL',target:'e1',value:'text'}));assert.ok(parseProposal({op:'SELECT',target:'e1',value:'option'}));
});
test('Gemini adapter pins header authentication, translates roles and reports usage without leaking thought text',async()=>{
 let request;const adapter=new ModelAdapter(async(url,options)=>{request={url,options,body:options.body?JSON.parse(options.body):null};return Response.json(options.method==='GET'?{models:[{name:'models/gemini-fixture',supportedGenerationMethods:['generateContent']}]}:{candidates:[{content:{parts:[{text:'private reasoning',thought:true},{text:'{"reply":"Hello","action":null}'}]}}],usageMetadata:{promptTokenCount:12,candidatesTokenCount:4,thoughtsTokenCount:2,cachedContentTokenCount:3}})});
 const config={provider:'gemini',endpoint:'https://generativelanguage.googleapis.com/v1beta',key:'fixture-placeholder'};
 assert.deepEqual(await adapter.models(config,new AbortController().signal),['gemini-fixture']);
 const reply=await adapter.chat(config,'gemini-fixture',[{role:'assistant',content:'previous'}],'Hello',null,new AbortController().signal);
 assert.equal(request.options.headers['x-goog-api-key'],config.key);assert.equal(request.url.includes(config.key),false);assert.equal(request.body.contents[0].role,'model');assert.equal(reply.text,'Hello');assert.deepEqual(reply.usage,{input:12,output:6,cached:3});
});
test('model options reject nonfinite costs and token limits; estimate separates cached input',()=>{
 assert.equal(parseOptions({...defaultOptions,budget:Infinity}),null);assert.equal(parseOptions({...defaultOptions,maxOutput:1000000}),null);
 assert.equal(estimatedCost({input:1000000,cached:500000,output:1000000},{...defaultOptions,inputPrice:2,cachedPrice:1,outputPrice:3}),4.5);
});
