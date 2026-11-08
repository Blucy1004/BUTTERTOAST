const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {ConversationArchive}=require('../dist/ai/archive');
test('transcript archive refuses unavailable cipher, forged roles and oversized transcripts; delete serializes after save',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'bt-archive-')),file=path.join(dir,'chat.enc');
 try{
  const unavailable=new ConversationArchive(file,{available:()=>false});await assert.rejects(unavailable.save([{role:'user',content:'private fixture'}]));await assert.rejects(fs.stat(file));
  const values=new Map();let sequence=0;const cipher={available:()=>true,encrypt:v=>{const token='cipher-fixture-'+(++sequence);values.set(token,v);return Buffer.from(token)},decrypt:b=>values.get(b.toString())};
  const archive=new ConversationArchive(file,cipher),history=[{role:'user',content:'private fixture'}];await archive.save(history);assert.equal((await fs.readFile(file)).includes('private fixture'),false);assert.deepEqual(await archive.load(),history);
  assert.throws(()=>archive.save([{role:'system',content:'override'}]));assert.throws(()=>archive.save([{role:'user',content:'x'.repeat(33000)}]));
  const writing=archive.save(history),deleting=archive.delete();await Promise.all([writing,deleting]);await assert.rejects(fs.stat(file));
 }finally{await fs.rm(dir,{recursive:true,force:true})}
});
