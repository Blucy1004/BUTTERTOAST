const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const {createHash}=require('node:crypto');
fs.mkdirSync('artifacts', {recursive:true});
// Use npm's CLI JS for Windows portability, without a command shell.
const npmCli = process.env.npm_execpath;
if (!npmCli) throw new Error('Run using npm run sbom');
const data = execFileSync(process.execPath, [npmCli,'sbom','--sbom-format','cyclonedx'], {maxBuffer:10*1024*1024});
const bom=JSON.parse(data.toString()),font=fs.readFileSync('src/fonts/PretendardVariable.woff2');
const fontRef='urn:buttertoast:font:pretendard:1.3.9';
bom.components.push({type:'file','bom-ref':fontRef,name:'Pretendard Variable',version:'1.3.9',licenses:[{license:{id:'OFL-1.1'}}],hashes:[{alg:'SHA-256',content:createHash('sha256').update(font).digest('hex')}],externalReferences:[{type:'distribution',url:'https://github.com/orioncactus/pretendard/tree/v1.3.9'}]});
const rootDependency=bom.dependencies?.find(d=>d.ref===bom.metadata?.component?.['bom-ref']);
if(rootDependency)rootDependency.dependsOn.push(fontRef);
fs.writeFileSync('artifacts/sbom.cdx.json',JSON.stringify(bom,null,2)+'\n');
console.log('Wrote artifacts/sbom.cdx.json');
