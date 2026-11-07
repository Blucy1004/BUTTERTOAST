// Narrow local credential-pattern check; complements platform secret scanning.
// Report locations only: never print a matched secret.
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const files = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], {encoding:'utf8'}).split('\0').filter(Boolean);
const rules = [
  /-----BEGIN (?:RSA |EC |OPENSSH |ENCRYPTED )?PRIVATE KEY-----/,
  /\bgh[pousr]_[A-Za-z0-9]{30,}\b/,
  /\bgithub_pat_[A-Za-z0-9_]{40,}\b/,
  /\bsk-(?:proj-|ant-)?[A-Za-z0-9_-]{32,}\b/,
  /\bAKIA[A-Z0-9]{16}\b/
];
let found = 0;
for (const file of new Set(files)) {
  if (!fs.existsSync(file) || !fs.lstatSync(file).isFile()) continue;
  const data = fs.readFileSync(file);
  if (data.includes(0)) continue;
  data.toString('utf8').split('\n').forEach((line,index) => {
    if (rules.some(rule=>rule.test(line))) {console.error(`Possible credential: ${file}:${index+1}`);found++;}
  });
}
if (found) process.exitCode=1; else console.log('No supported credential patterns found (not an exhaustive scan).');
