// Keep Electron's own installer and checksum validation. Only its download transport has a fallback.
const {spawnSync,execFileSync}=require('node:child_process');
const fs=require('node:fs'),path=require('node:path');
const {officialAsset,verifyFile}=require('./electron-artifacts.cjs');
const {version}=require('electron/package.json'),checksums=require('electron/checksums.json');
const cacheRoot=path.resolve(__dirname,'../artifacts/.electron-cache');
const environment={...process.env,electron_config_cache:cacheRoot};
const install=()=>spawnSync(process.execPath,[require.resolve('electron/install.js')],{env:environment,stdio:'inherit',timeout:150000});
(async()=>{
 if(install().status===0)return;
 if(!['linux','win32'].includes(process.platform)||process.arch!=='x64')throw Error('Fallback supports the tested Linux/Windows x64 builds only');
 const name=`electron-v${version}-${process.platform}-${process.arch}.zip`,sha=checksums[name];
 const release=JSON.parse(execFileSync('gh',['api',`repos/electron/electron/releases/tags/v${version}`],{encoding:'utf8',timeout:30000,maxBuffer:4*1024*1024}));
 const asset=officialAsset(release,version,name,sha);
 console.log(`Using official GitHub asset API for ${name}; package-pinned checksums remain required.`);
 const {downloadArtifact}=await import('@electron/get');
 await downloadArtifact({version,artifactName:'electron',platform:process.platform,arch:process.arch,cacheRoot,checksums,
  downloader:{async download(url,target){
   if(url!==asset.browser_download_url)throw Error('Unexpected Electron download URL');
   const handle=fs.openSync(target,'wx',0o600);
   try{execFileSync('gh',['api',`repos/electron/electron/releases/assets/${asset.id}`,'-H','Accept: application/octet-stream'],{stdio:['ignore',handle,'pipe'],timeout:150000});}finally{fs.closeSync(handle);}
   await verifyFile(target,asset.size,sha);
  }}
 });
 if(install().status!==0)throw Error('Verified Electron installation failed');
})().catch(error=>{console.error(error.message);process.exitCode=1});
