// Dependency injection ONLY in test entrypoints, before importing production main.
// Exercises persistence/crash consistency, NOT OS key protection. Never bundled.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
function installTestCipher(directory){
  const file=path.join(directory,'TEST-ONLY-KEY');
  if(!fs.existsSync(file))fs.writeFileSync(file,crypto.randomBytes(32),{mode:0o600,flag:'wx'});
  const key=fs.readFileSync(file);
  const cipher={available:async()=>true,encrypt:async text=>{const iv=crypto.randomBytes(12),c=crypto.createCipheriv('aes-256-gcm',key,iv),data=Buffer.concat([c.update(text,'utf8'),c.final()]);return Buffer.concat([iv,c.getAuthTag(),data]);},decrypt:async bytes=>{const c=crypto.createDecipheriv('aes-256-gcm',key,bytes.subarray(0,12));c.setAuthTag(bytes.subarray(12,28));return Buffer.concat([c.update(bytes.subarray(28)),c.final()]).toString('utf8');}};
  require('../../dist/security/os-cipher').osCipher=cipher;return cipher;
}
module.exports={installTestCipher};
