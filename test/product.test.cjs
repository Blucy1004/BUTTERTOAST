const test=require('node:test'),assert=require('node:assert/strict');
const {featureAccess,productState,supportDestination}=require('../dist/product/access');
const {parseAiCommand}=require('../dist/ai/protocol');
const {parseManagerCommand}=require('../dist/browser/manager-protocol');
test('free browser and ToastIR capabilities cannot be paywalled or upgraded by untrusted metadata',()=>{
 for(const id of ['browsing','byok','toastir','basic-history','workspaces'])assert.equal(featureAccess(id).allowed,true);
 for(const value of [{plan:'Ultra',approved:true},'unknown','chatgpt-subscription','advanced-queue'])assert.equal(featureAccess(value).allowed,false);
 const state=productState();assert.equal(state.billingEnabled,false);assert.equal(state.artificialAiDelayMs,0);assert.deepEqual(state.plans.map(p=>p.name),['Original','Margarine','100% Milk','Organic']);assert.ok(state.plans.every(p=>p.price===null));assert.equal(state.donations.amount,null);
 state.plans[0].name='tamper';assert.equal(productState().plans[0].name,'Original');assert.equal(parseAiCommand({type:'connect-subscription',token:'forged',plan:'Ultra'}),null);
 assert.equal(parseManagerCommand({type:'support-open',id:'source',url:'https://evil.test'}),null);assert.equal(supportDestination('https://evil.test'),null);
});
