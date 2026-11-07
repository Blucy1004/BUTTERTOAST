const {test}=require('node:test');
const assert=require('node:assert/strict');
const {generateKeyPairSync,sign,createHash}=require('node:crypto');
const {verifyUpdate}=require('../dist/security/update');
// Ephemeral test-only key, unrelated to future release signing identity.
const {privateKey,publicKey}=generateKeyPairSync('ed25519');
const artifact=Buffer.from('local non-executable update test fixture');
const base={version:'1.0.1',url:'https://updates.example.test/release.zip',size:artifact.length,sha256:createHash('sha256').update(artifact).digest('hex'),expires:2000};
const policy={publisherKey:publicKey,currentVersion:'1.0.0',downloadOrigin:'https://updates.example.test',now:1000};
function signed(extra={}){const manifest=Buffer.from(JSON.stringify({...base,...extra}));return [manifest,sign(null,manifest,privateKey)]}
test('valid signed package accepted and returned artifact detached from input',()=>{
 const [m,s]=signed();const input=Buffer.from(artifact);const checked=verifyUpdate(m,s,input,policy);input.fill(0);assert.equal(checked.version,'1.0.1');assert.deepEqual(checked.artifact,artifact);
});
test('tampered manifest, signature, package and wrong signing key are rejected',()=>{
 const [m,s]=signed();const forged=Buffer.from(m);forged[0]^=1;const sig=Buffer.from(s);sig[0]^=1;const binary=Buffer.from(artifact);binary[0]^=1;
 for(const args of [[forged,s,artifact,policy],[m,sig,artifact,policy],[m,s,binary,policy],[m,s,artifact,{...policy,publisherKey:generateKeyPairSync('ed25519').publicKey}]])assert.throws(()=>verifyUpdate(...args),/rejected/);
});
test('signed rollback, expiration, alternate host, HTTP and unexpected fields still rejected',()=>{
 for(const extra of [{version:'0.9.9'},{version:'1.0.0'},{expires:1000},{url:'https://evil.example.test/payload'},{url:'http://updates.example.test/payload'},{url:'https://user:pass@updates.example.test/payload'},{execute:'arbitrary code'},{size:1}]){const [m,s]=signed(extra);assert.throws(()=>verifyUpdate(m,s,artifact,policy),/rejected/)}
});
