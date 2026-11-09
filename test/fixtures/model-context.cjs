const assert=require('node:assert/strict'),{applyModelFrame}=require('../../dist/toastir/model');
module.exports=messages=>{
 const context=JSON.parse(messages.at(-1).content).untrusted_page_context;if(context?.schema!=='toastir/1')return context;
 let baseline=null;
 for(const message of messages.filter(m=>m.role==='user')){let parsed;try{parsed=JSON.parse(message.content)}catch{continue;}if(parsed.untrusted_page_context?.schema==='toastir/1'){baseline=applyModelFrame(baseline,parsed.untrusted_page_context);assert.ok(baseline,'Every delta requires its full baseline in the actual request');}}
 return {...baseline,elements:baseline.elements.map(([id,role,name,actions])=>({id,role,name,actions}))};
};
