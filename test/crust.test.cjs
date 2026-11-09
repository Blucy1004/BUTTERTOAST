const test=require('node:test'),assert=require('node:assert/strict');
const {CommandBar}=require('../dist/browser/command-bar');
const {parseCommand}=require('../dist/security/ipc');
test('command bar searches local tabs/library, uses selected engine and consumes bounded opaque capabilities',()=>{
 const c=new CommandBar(),tabs=[{id:7,title:'Example tab',url:'https://example.test'}],bookmarks=[{id:'b',title:'Example bookmark',url:'https://saved.test',time:1}];
 let rows=c.search('example',tabs,bookmarks,[],'google',10);assert.deepEqual(rows.map(r=>r.kind),['tab','bookmark','navigate','draft']);
 assert.deepEqual(c.take(rows[0].id,11),{kind:'tab',tab:7});assert.equal(c.take(rows[0].id,11),null);
 const old=c.search('/ai read this',tabs,[],[],'google',20);assert.equal(old.length,1);assert.equal(c.take(old[0].id,120021),null);
 rows=c.search('hello world',[],[],[],'brave',30);assert.match(c.take(rows[0].id,31).url,/search.brave.com/);
 rows=c.search('file:///etc/passwd',[],[],[],'google',40);assert.equal(rows.some(r=>r.kind==='navigate'),false);
 rows=c.search('example',tabs,[],[],'google',50);c.search('changed',tabs,[],[],'google',51);assert.equal(c.take(rows[0].id,52),null);
 assert.deepEqual(c.search('x'.repeat(257),tabs,[],[],'google'),[]);
});
test('command bar IPC refuses URL injection, replay authorities and oversized input',()=>{
 for(const value of [{type:'command-execute',id:'x',url:'https://evil.test'},{type:'command-open',approved:true},{type:'command-query',query:'x'.repeat(257)},{type:'favorite-open',id:'../secret'},{type:'command-query',query:'a\nb'}])assert.equal(parseCommand(value),null);
 assert.deepEqual(parseCommand({type:'command-query',query:'/ai summarize'}),{type:'command-query',query:'/ai summarize'});
});
const {parseSession}=require('../dist/browser/session-store');
const {splitGeometry}=require('../dist/browser/split');
test('split geometry is bounded, non-overlapping and collapses on narrow browsers',()=>{
 for(const width of [100,420,800,1500])for(const ratio of [.25,.5,.75,NaN,Infinity]){
  const bounds={x:100,y:200,width,height:500},g=splitGeometry(bounds,ratio,true);assert.equal(g.visible,width>=420);
  if(g.visible){assert.equal(g.left.x+g.left.width,g.divider.x);assert.equal(g.divider.x+g.divider.width,g.right.x);assert.equal(g.right.x+g.right.width,bounds.x+bounds.width);}
 }
 for(const cmd of [{type:'split-tab',id:1,side:'outside'},{type:'split-resize',ratio:NaN},{type:'split-resize',ratio:.2},{type:'split-tab',id:1,side:'left',approved:true}])assert.equal(parseCommand(cmd),null);
});
test('session v3 strictly validates groups and split while v1/v2 remain readable',()=>{
 const tab={url:'https://example.test/',pinned:false,muted:false,group:'group-1'},group={id:'group-1',name:'Research',color:'blue',collapsed:true};
 const value={version:3,active:0,tabs:[tab,{...tab,url:'https://other.test/'}],groups:[group],split:{left:0,right:1,ratio:.5}};
 assert.deepEqual(parseSession(value),value);
 for(const bad of [{...value,groups:[group,group]},{...value,groups:[{...group,name:'\n'}]},{...value,tabs:[{...tab,group:'missing'}]},{...value,split:{left:0,right:0,ratio:.5}},{...value,split:{left:0,right:1,ratio:NaN}},{...value,split:{left:0,right:1,ratio:.9}},{...value,approved:true}])assert.equal(parseSession(bad),null);
 assert.ok(parseSession({version:1,active:0,tabs:['']}));assert.ok(parseSession({version:2,active:0,tabs:[{url:'',pinned:true,muted:false}]}));
 assert.equal(parseCommand({type:'group-update',id:'id',name:'group',color:'url(https://evil.test)'}),null);
});
