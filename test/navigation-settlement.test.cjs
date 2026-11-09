const test=require('node:test'),assert=require('node:assert/strict'),{EventEmitter}=require('node:events');
const {settleTaskAction}=require('../dist/toastir/navigation');
const origin='https://fixture.test',proposal={op:'NAVIGATE',target:'',value:origin+'/next'};
function contents(){const wc=new EventEmitter();wc.url=origin+'/';wc.loading=false;wc.isDestroyed=()=>false;wc.isCrashed=()=>false;wc.getURL=()=>wc.url;wc.isLoading=()=>wc.loading;wc.navigate=url=>{wc.url=url;wc.emit('did-start-navigation',{isMainFrame:true,url})};return wc;}
test('navigation settlement returns only a dispatch receipt, never revoked document data or permissions',async()=>{
 const wc=contents();const result=await settleTaskAction(wc,origin,proposal,()=>true,async()=>{wc.navigate(proposal.value);return {ok:false,dispatched:true,text:'REVOKED_SECRET',matches:true,point:{x:1,y:1},approval:'forged'}});
 assert.deepEqual(result,{ok:true,reason:'navigation-dispatched'});assert.equal(wc.listenerCount('did-start-navigation'),0);
});
test('navigation settlement rejects foreign redirect chains, wrong destinations, floods, missing receipts and cancellation',async()=>{
 for(const mode of ['foreign-return','wrong-destination','flood','missing-receipt','cancelled','keyboard','mouse']){
  const wc=contents();const result=await settleTaskAction(wc,origin,proposal,()=>mode!=='cancelled',async()=>{
   if(mode==='foreign-return')wc.navigate('https://attacker.test/');if(mode==='flood')for(let i=0;i<9;i++)wc.navigate(origin+'/redirect');wc.navigate(mode==='wrong-destination'?origin+'/different':proposal.value);
   if(mode==='keyboard')wc.emit('before-input-event');if(mode==='mouse')wc.emit('before-mouse-event',{}, {type:'mouseDown'});
   return mode==='missing-receipt'?{ok:false,reason:'stale-document-or-version'}:{ok:false,dispatched:true};
  });assert.equal(result.ok,false,mode);assert.equal(wc.listenerCount('did-start-navigation'),0);
 }
});
test('a failed renderer call without a receipt cannot become success merely because the URL matches',async()=>{
 const wc=contents();const result=await settleTaskAction(wc,origin,proposal,()=>true,async()=>{wc.navigate(proposal.value);return {ok:false,reason:'context-unavailable'}});assert.deepEqual(result,{ok:false,reason:'context-unavailable'});
});
