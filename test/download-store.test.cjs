const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {DownloadStore,parseDownloads}=require('../dist/browser/download-store');
const sample={id:'11111111-1111-4111-8111-111111111111',name:'fixture.txt',origin:'https://download.test',received:100,total:100,state:'completed',paused:false,protection:'not-applicable',path:path.join(os.tmpdir(),'fixture.txt')};
test('download history is bounded and contains no live item, credentialed origin or relative file authority',()=>{
 assert.ok(parseDownloads([sample]));for(const patch of [{item:{}},{path:'relative.txt'},{origin:'https://user:pass@download.test'},{origin:'https://download.test/private?token=x'},{state:'invented'},{received:NaN},{path:sample.path+'\n'},{paused:true}])assert.equal(parseDownloads([{...sample,...patch}]),null);assert.equal(parseDownloads([sample,sample]),null);
});
test('download history roundtrips only OS cipher bytes and keeps plaintext off disk when encryption is unavailable',async t=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'bt-download-store-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));const file=path.join(dir,'downloads.enc');let payload='';
 const cipher={available:()=>true,encrypt:text=>{payload=text;return Buffer.from('fixture-encrypted-download-history')},decrypt:()=>payload};
 const store=new DownloadStore(file,cipher);await store.load();store.save([sample]);await store.flush();assert.equal((await fs.readFile(file)).includes('fixture.txt'),false);assert.deepEqual(await new DownloadStore(file,cipher).load(),[sample]);
 const unavailable=new DownloadStore(path.join(dir,'not-written.enc'),{...cipher,available:()=>false});await unavailable.load();unavailable.save([sample]);await unavailable.flush();await assert.rejects(fs.stat(path.join(dir,'not-written.enc')),{code:'ENOENT'});
});
