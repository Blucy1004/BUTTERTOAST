const test=require('node:test'),assert=require('node:assert/strict');
const {parseImport,exportBookmarks}=require('../dist/browser/import');
const {addressSuggestions}=require('../dist/browser/suggestions');
const {parseCommand}=require('../dist/security/ipc');
const {parseManagerCommand}=require('../dist/browser/manager-protocol');
const {parseSettings}=require('../dist/browser/library');
test('Chrome bookmark import is bounded inert text, rejects dangerous URLs and safely roundtrips HTML entities',()=>{
 const input='<!DOCTYPE NETSCAPE-Bookmark-file-1>\n<DL><p><DT><A HREF="https://example.test/?a=1&amp;b=2" ADD_DATE="1700000000">A &lt; B &amp; C</A><A HREF="javascript:alert(1)">BAD</A><A HREF="file:///private">FILE</A><A HREF="https://u:p@example.test">CREDENTIALS</A><script>fetch("https://attacker.test")</script></DL>';
 const parsed=parseImport('bookmarks',input);assert.equal(parsed.entries.length,1);assert.equal(parsed.skipped,3);assert.equal(parsed.entries[0].url,'https://example.test/?a=1&b=2');assert.equal(parsed.entries[0].title,'A < B & C');
 assert.deepEqual(parseImport('bookmarks',exportBookmarks(parsed.entries)).entries,parsed.entries);
 assert.throws(()=>parseImport('bookmarks','<a href="https://example.test">Unknown format</a>'));assert.throws(()=>parseImport('bookmarks','x'.repeat(2097153)));
});
test('Takeout history and settings imports accept only supported data; permissions and account authority cannot be imported',()=>{
 const parsed=parseImport('history',JSON.stringify({'Browser History':[{url:'https://example.test',title:'Example',time_usec:'1700000000000000'},{url:'data:text/html,x',title:'bad'}]}));assert.equal(parsed.entries.length,1);assert.equal(parsed.entries[0].time,1700000000000);
 const settings={search:'google',theme:'off',history:true,restoreTabs:true,memorySaver:true};assert.deepEqual(parseImport('settings',JSON.stringify({schema:'buttertoast-settings/1',settings})).settings,settings);
 assert.throws(()=>parseImport('settings',JSON.stringify({schema:'buttertoast-settings/1',settings,permissions:['allow']})));
 assert.equal(parseSettings({...settings,memorySaver:'yes'}),null);assert.equal(parseSettings({search:'google',theme:'off',history:true,restoreTabs:true}).memorySaver,false);
 for(const command of [{type:'import',kind:'passwords'},{type:'import',kind:'bookmarks',path:'/private'},{type:'export',kind:'history'},{type:'reorder',id:1,before:2,approved:true},{type:'reorder',id:1,before:-1},{type:'suggest',query:'secret',allTabs:true}])assert.equal(command.type==='import'||command.type==='export'?parseManagerCommand(command):parseCommand(command),null);
});
test('local suggestions rank bookmark prefixes, deduplicate URLs, bound results and reject invalid targets',()=>{
 const entry=(url,title,time=1)=>({id:url,url,title,time}),bookmarks=[entry('https://example.test','Example',1)],history=[entry('https://example.test','Duplicate',99),entry('https://other.test','Example',100),entry('file:///example','Example',200),...Array.from({length:20},(_,i)=>entry(`https://example${i}.test`,'Example'))];
 const result=addressSuggestions('example',bookmarks,history);assert.equal(result.length,8);assert.equal(result[0].source,'bookmark');assert.equal(result.filter(e=>e.url==='https://example.test').length,1);assert.equal(result.some(e=>e.url.startsWith('file:')),false);assert.deepEqual(addressSuggestions('x'.repeat(257),bookmarks,history),[]);assert.deepEqual(addressSuggestions('',bookmarks,history),[]);
});
