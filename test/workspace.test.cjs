const test=require('node:test'),assert=require('node:assert/strict');
const {workspaceGeometry,defaultWorkspace,parseWorkspace}=require('../dist/browser/workspace');
const {parseCommand}=require('../dist/security/ipc');
const {parseAiCommand}=require('../dist/ai/protocol');
const {parseLibrary,BrowserLibrary}=require('../dist/browser/library');
test('workspace bounds remain inside the window and never overlap at supported sizes',()=>{
 for(const width of [600,720,760,1000,1080,1280,1440,1920,2400])for(const left of [160,220,420])for(const right of [300,420,720])for(const leftCollapsed of [false,true])for(const rightCollapsed of [false,true])for(const focus of [false,true]){
  const g=workspaceGeometry(width,800,{left,right,leftCollapsed,rightCollapsed},focus);
  for(const b of [g.butter,...g.browserVisible?[g.browser]:[],...g.toastVisible?[g.toast]:[]]){assert.ok(b.x>=0&&b.y>=0&&b.width>0&&b.x+b.width<=width&&b.y+b.height<=800);}
  if(g.browserVisible){assert.ok(g.browser.width>=280);assert.ok(g.butter.x+g.butter.width<g.browser.x);}
  if(g.toastVisible&&g.browserVisible){assert.ok(g.toast.width>=300);assert.ok(g.browser.x+g.browser.width<g.toast.x);}
 }
});
test('workspace and visual IPC reject substituted URLs, authority, invalid widths and fake events',()=>{
 for(const v of [{...defaultWorkspace(),left:Infinity},{...defaultWorkspace(),right:299},{...defaultWorkspace(),approved:true}])assert.equal(parseWorkspace(v),null);
 for(const cmd of [{type:'delegate',id:1,url:'https://evil.test'},{type:'workspace-resize',side:'left',width:10},{type:'workspace-resize',side:'left',width:200.5},{type:'workspace-drag',active:true,approved:true}])assert.equal(parseCommand(cmd),null);
 for(const cmd of [{type:'replay',id:1,event:{op:'CLICK'}},{type:'visual-options',speed:0,motion:true},{type:'task-return',url:'file:///etc/passwd'},{type:'task-display',mode:'javascript'}])assert.equal(parseAiCommand(cmd),null);
 assert.ok(parseCommand({type:'delegate',id:1}));assert.ok(parseAiCommand({type:'replay',id:1}));
});
test('legacy encrypted library schema migrates to default workspace preferences',()=>{
 const lib=new BrowserLibrary('',{available:()=>false});const old=lib.snapshot();delete old.workspace;
 assert.deepEqual(parseLibrary(old).workspace,defaultWorkspace());
 lib.configureWorkspace({...defaultWorkspace(),left:310,right:510,leftCollapsed:true});
 assert.deepEqual(parseLibrary(lib.snapshot()).workspace,{left:310,right:510,leftCollapsed:true,rightCollapsed:false});
});
