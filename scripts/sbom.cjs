const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
fs.mkdirSync('artifacts', {recursive:true});
// Use npm's CLI JS for Windows portability, without a command shell.
const npmCli = process.env.npm_execpath;
if (!npmCli) throw new Error('Run using npm run sbom');
const data = execFileSync(process.execPath, [npmCli,'sbom','--sbom-format','cyclonedx'], {maxBuffer:10*1024*1024});
JSON.parse(data.toString());
fs.writeFileSync('artifacts/sbom.cdx.json',data);
console.log('Wrote artifacts/sbom.cdx.json');
