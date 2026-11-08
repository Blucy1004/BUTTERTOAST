const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
const {BrowserLibrary,parseLibrary,parseSettings}=require('../dist/browser/library');
const {parseManagerCommand}=require('../dist/browser/manager-protocol');
const {safeDownloadName,safeDownloadChain,executableName}=require('../dist/browser/download-policy');
const {googleSearch,themeCss}=require('../dist/browser/theme');
const {resolveAddress}=require('../dist/policy');
test('library preserves bookmarks/settings/deletions through encrypted serialization; unavailable cipher writes nothing',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'bt-library-')),file=path.join(dir,'library.enc'),key=crypto.randomBytes(32);
 const cipher={available:()=>true,encrypt:text=>{const iv=crypto.randomBytes(12),c=crypto.createCipheriv('aes-256-gcm',key,iv);return Buffer.concat([iv,c.update(text),c.final(),c.getAuthTag()])},decrypt:bytes=>{const d=crypto.createDecipheriv('aes-256-gcm',key,bytes.subarray(0,12));d.setAuthTag(bytes.subarray(-16));return Buffer.concat([d.update(bytes.subarray(12,-16)),d.final()]).toString()}};
 try {
  const lib=new BrowserLibrary(file,cipher);await lib.load();lib.bookmark('https://example.test/?private=fixture','<img>');lib.visit('https://example.test/','Example');lib.setPermission('https://example.test','media','deny');lib.configure({search:'brave',theme:'dark',history:false,restoreTabs:false});lib.audit('https://example.test','CLICK','approved');await lib.flush();
  assert.equal((await fs.readFile(file)).includes('private=fixture'),false);
  const restored=new BrowserLibrary(file,cipher);await restored.load();assert.equal(restored.snapshot().bookmarks[0].title,'<img>');assert.equal(restored.settings().theme,'dark');assert.equal(restored.permission('https://example.test','media'),'deny');
  restored.clear('history');restored.remove('bookmarks',restored.snapshot().bookmarks[0].id);await restored.flush();const final=new BrowserLibrary(file,cipher);await final.load();assert.equal(final.snapshot().history.length,0);assert.equal(final.snapshot().bookmarks.length,0);
  const memory=new BrowserLibrary(path.join(dir,'no.enc'),{available:()=>false,encrypt:()=>{throw Error('never')}});await memory.load();memory.bookmark('https://example.test/','only RAM');await memory.flush();assert.equal(memory.snapshot().bookmarks.length,1);await assert.rejects(fs.stat(path.join(dir,'no.enc')));
 }finally{await fs.rm(dir,{recursive:true,force:true})}
});
test('library and management IPC reject unsafe URLs, authority fields and arbitrary paths',()=>{
 const lib=new BrowserLibrary('',{available:()=>false});lib.bookmark('javascript:alert(1)','bad');lib.bookmark('https://user:pass@example.test','bad');assert.equal(lib.snapshot().bookmarks.length,0);
 const snapshot=lib.snapshot();snapshot.permissions=[{origin:'http://example.test',permission:'media',decision:'allow'}];assert.equal(parseLibrary(snapshot),null);
 for(const c of [{type:'entry-open',kind:'bookmarks',id:'a',url:'file:///tmp/secret'},{type:'download',id:'a',action:'execute'},{type:'permission',origin:'https://example.test',permission:'display-capture',decision:'allow'},{type:'permission',origin:'https://example.test/path',permission:'media',decision:'allow'},{type:'settings',settings:{search:'google',theme:'url(https://evil.test)',history:true,restoreTabs:true}}])assert.equal(parseManagerCommand(c),null);
 assert.equal(parseSettings({search:'google',theme:'off',history:true,restoreTabs:true,approved:true}),null);
 assert.ok(parseManagerCommand({type:'permission',origin:'https://example.test',permission:'media',decision:'deny'}));
});
test('download paths and redirect chains cannot smuggle local paths, credentials or HTTPS downgrades',()=>{
 for(const value of ['../../payload.exe','C:\\temp\\payload.exe'])assert.equal(safeDownloadName(value),'payload.exe');
 for(const value of ['CON','NUL.txt','..',''])assert.equal(safeDownloadName(value),'download.bin');
 assert.equal(executableName('document.pdf.exe'),true);assert.equal(safeDownloadName('safe\u202etxt.exe').includes('\u202e'),false);
 for(const chain of [[],['file:///tmp/a'],['https://x.test/a','http://x.test/b'],['https://user:pass@x.test']])assert.equal(safeDownloadChain(chain),false);
 assert.equal(safeDownloadChain(['http://x.test/a','https://x.test/b']),true);
});
test('search providers only navigate normal URLs and Google theme is scoped to exact search hosts',()=>{
 assert.equal(resolveAddress('hello & world','brave'),'https://search.brave.com/search?q=hello%20%26%20world');
 assert.equal(resolveAddress('hello','duckduckgo'),'https://duckduckgo.com/?q=hello');
 assert.equal(googleSearch('https://www.google.com/search?q=test'),true);
 for(const url of ['https://google.com.evil.test/search','https://accounts.google.com/search','http://www.google.com/search','https://www.google.com:444/search','https://www.google.com/maps'])assert.equal(googleSearch(url),false);
 assert.equal(themeCss('off'),'');assert.doesNotMatch(themeCss('dark'),/url\(|display\s*:\s*none|javascript/i);
});
test('library coalesces pending writes instead of accumulating snapshots during a slow OS cipher',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'bt-library-queue-'));let release,writes=0;
 const cipher={available:()=>true,encrypt:async value=>{writes++;if(writes===1)await new Promise(r=>release=r);return Buffer.from(value).reverse()},decrypt:bytes=>Buffer.from(bytes).reverse().toString()};
 try{const file=path.join(dir,'library.enc'),lib=new BrowserLibrary(file,cipher);await lib.load();lib.bookmark('https://example.test','bookmark');for(let i=0;i<100;i++)lib.configure({search:'google',theme:i===99?'dark':'light',history:true,restoreTabs:true});release();await lib.flush();assert.equal(writes,2);const restored=new BrowserLibrary(file,cipher);await restored.load();assert.equal(restored.settings().theme,'dark');}finally{await fs.rm(dir,{recursive:true,force:true})}
});
