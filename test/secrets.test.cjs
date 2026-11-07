const {test}=require('node:test');
const assert=require('node:assert/strict');
const {spawnSync,execFileSync}=require('node:child_process');
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
test('credential scan detects a fixture and reports location without printing its value',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bt-scan-'));
 try{
  execFileSync('git',['init','--quiet'],{cwd:dir});
  const fake=['ghp','_'+'a'.repeat(36)].join('');fs.writeFileSync(path.join(dir,'fixture.txt'),`token=${fake}\n`);
  const result=spawnSync(process.execPath,[path.resolve('scripts/scan-secrets.cjs')],{cwd:dir,encoding:'utf8'});
  assert.equal(result.status,1);assert.match(result.stderr,/fixture.txt:1/);assert.equal((result.stdout+result.stderr).includes(fake),false);
 }finally{fs.rmSync(dir,{recursive:true,force:true})}
});
