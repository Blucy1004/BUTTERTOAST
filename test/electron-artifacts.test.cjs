const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path'),{createHash}=require('node:crypto');
const {officialAsset,verifyFile}=require('../scripts/electron-artifacts.cjs');
test('engine download fallback binds official asset metadata, size and bytes to the package-pinned SHA-256',async t=>{
 const bytes=Buffer.from('engine fixture'),sha=createHash('sha256').update(bytes).digest('hex'),name='electron-v1.2.3-linux-x64.zip';
 const asset={id:123,name,state:'uploaded',size:bytes.length,digest:`sha256:${sha}`,browser_download_url:`https://github.com/electron/electron/releases/download/v1.2.3/${name}`},release={tag_name:'v1.2.3',assets:[asset]};
 assert.deepEqual(officialAsset(release,'1.2.3',name,sha),asset);
 for(const change of [{digest:'sha256:'+'0'.repeat(64)},{size:1e12},{id:'123'},{state:'pending'},{browser_download_url:'https://other.test/engine.zip'}])assert.throws(()=>officialAsset({...release,assets:[{...asset,...change}]},'1.2.3',name,sha));
 assert.throws(()=>officialAsset({...release,tag_name:'v1.2.2'},'1.2.3',name,sha));assert.throws(()=>officialAsset({...release,assets:[asset,asset]},'1.2.3',name,sha));
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'bt-engine-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));const file=path.join(dir,'engine.zip');
 await fs.writeFile(file,bytes);await verifyFile(file,bytes.length,sha);await assert.rejects(verifyFile(file,bytes.length+1,sha));
 await fs.writeFile(file,Buffer.alloc(bytes.length));await assert.rejects(verifyFile(file,bytes.length,sha));
});
