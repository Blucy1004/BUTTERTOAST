const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {trustedGuidance}=require('../dist/ai/guidance');
test('trusted instructions use fixed packaged files rather than same-named files in the working directory',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'bt-guidance-')),original=process.cwd();
 try{await fs.writeFile(path.join(dir,'SYSTEM.md'),'UNTRUSTED_CWD_INSTRUCTION');process.chdir(dir);const instructions=await trustedGuidance();assert.match(instructions,/protocol v2/);assert.equal(instructions.includes('UNTRUSTED_CWD_INSTRUCTION'),false);}finally{process.chdir(original);await fs.rm(dir,{recursive:true,force:true})}
});
