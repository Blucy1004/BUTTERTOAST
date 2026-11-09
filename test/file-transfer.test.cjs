const {test}=require('node:test'),assert=require('node:assert/strict');
const {safeDownloadChain}=require('../dist/browser/download-policy');
const {parseCommand}=require('../dist/security/ipc');
test('web-generated exports require the current non-opaque HTTP(S) origin, never a forged blob origin',()=>{
 const page='https://exports.test/editor',blob='blob:https://exports.test/11111111-1111-4111-8111-111111111111';
 assert.equal(safeDownloadChain([blob],page),true);
 assert.equal(safeDownloadChain(['blob:http://localhost:8080/id'],'http://localhost:8080/page'),true);
 for(const [chain,source] of [
  [[blob],undefined],[[blob],'https://other.test'],[[blob],'https://exports.test.evil.test'],[[blob],'http://exports.test'],
  [['blob:null/id'],page],[['blob:file:///secret'],page],[['blob:https://user:pass@exports.test/id'],page],
  [[blob+'#fragment'],page],[[blob+'?token=bad'],page],[[blob+'\n'],page],[[blob],'about:blank'],
  [[blob,'https://exports.test/file'],page],[['https://exports.test/file',blob],page],
  [[blob],'https://user:password@exports.test/'],[['data:text/plain,abc'],page],[['file:///tmp/file'],page]
 ])assert.equal(safeDownloadChain(chain,source),false,JSON.stringify([chain,source]));
});
test('download context disallows direct mixed-content and redirect downgrades without blocking normal redirects',()=>{
 assert.equal(safeDownloadChain(['https://cdn.test/file'],'https://site.test/'),true);
 for(const source of ['', 'about:blank']){
  assert.equal(safeDownloadChain(['https://cdn.test/file'],source),true);
  assert.equal(safeDownloadChain(['blob:https://cdn.test/id'],source),false);
 }
 assert.equal(safeDownloadChain(['http://site.test/file'],'http://site.test/'),true);
 assert.equal(safeDownloadChain(['http://site.test/file','https://cdn.test/file'],'http://site.test/'),true);
 assert.equal(safeDownloadChain(['http://cdn.test/file'],'https://site.test/'),false);
 assert.equal(safeDownloadChain(['https://cdn.test/file','http://cdn.test/file'],'http://site.test/'),false);
 for(const url of ['https://u:p@cdn.test/file','https://cdn.test/\nfile','https://cdn.test/\\file'])assert.equal(safeDownloadChain([url],'https://site.test'),false);
});
test('download shortcut has no URL, file path or approval authority',()=>{
 assert.deepEqual(parseCommand({type:'downloads-open'}),{type:'downloads-open'});
 for(const extra of [{path:'/tmp/secret'},{url:'file:///tmp/secret'},{approved:true},{webContentsId:1}])assert.equal(parseCommand({type:'downloads-open',...extra}),null);
});
