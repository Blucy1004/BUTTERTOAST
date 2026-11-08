const {createHash}=require('node:crypto');
const fs=require('node:fs/promises');
const {createReadStream}=require('node:fs');
function officialAsset(release,version,name,sha){
 if(release.tag_name!==`v${version}`||!Array.isArray(release.assets)||!/^[a-f0-9]{64}$/.test(sha))throw Error('Unexpected Electron release');
 const matches=release.assets.filter(a=>a.name===name);if(matches.length!==1)throw Error('Missing or ambiguous Electron asset');
 const asset=matches[0];
 if(!Number.isSafeInteger(asset.id)||asset.id<1||asset.state!=='uploaded'||!Number.isSafeInteger(asset.size)||asset.size<1||asset.size>512*1024*1024
   ||asset.digest!==`sha256:${sha}`||asset.browser_download_url!==`https://github.com/electron/electron/releases/download/v${version}/${name}`)throw Error('Untrusted Electron asset metadata');
 return asset;
}
async function verifyFile(file,size,sha){
 const stat=await fs.lstat(file);if(!stat.isFile()||stat.isSymbolicLink()||stat.size!==size)throw Error('Electron asset size mismatch');
 const digest=createHash('sha256');for await(const chunk of createReadStream(file))digest.update(chunk);
 if(digest.digest('hex')!==sha)throw Error('Electron asset hash mismatch');
}
module.exports={officialAsset,verifyFile};
