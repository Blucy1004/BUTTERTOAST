// Release operator only. The signing key stays outside Git and the application package.
import fs from 'node:fs/promises';
import {createPrivateKey,createPublicKey,createHash,sign,verify} from 'node:crypto';
const args=process.argv.slice(2),options={};
for(let i=0;i<args.length;i+=2){if(!['--artifact','--url','--version','--key-file','--output'].includes(args[i])||!args[i+1]||options[args[i]])throw Error('Expected --artifact --url --version --key-file --output');options[args[i]]=args[i+1];}
if(Object.keys(options).length!==5)throw Error('Missing release arguments');
const url=new URL(options['--url']);if(url.protocol!=='https:'||url.username||url.password||url.hash||!url.pathname.endsWith('.exe'))throw Error('HTTPS installer URL required');
if(!/^(0|[1-9]\d{0,5})\.(0|[1-9]\d{0,5})\.(0|[1-9]\d{0,5})$/.test(options['--version']))throw Error('Release version rejected');
const key=createPrivateKey(await fs.readFile(options['--key-file']));if(key.asymmetricKeyType!=='ed25519')throw Error('Ed25519 signing key required');
const bytes=await fs.readFile(options['--artifact']);if(bytes.length>512*1024*1024||bytes.toString('ascii',0,2)!=='MZ')throw Error('Installer rejected');
const manifest=Buffer.from(JSON.stringify({version:options['--version'],url:url.href,size:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),expires:Date.now()+7*86400*1000}));
const signature=sign(null,manifest,key);if(!verify(null,manifest,createPublicKey(key),signature))throw Error('Signature self-check failed');
await fs.writeFile(options['--output'],manifest,{flag:'wx'});await fs.writeFile(options['--output']+'.sig',signature,{flag:'wx'});
console.log('Wrote verified manifest and detached signature. No files were published.');
