const test=require('node:test'),assert=require('node:assert/strict'),{generateKeyPairSync,sign,createHash}=require('node:crypto');
const {UpdateClient}=require('../dist/security/update-client');
test('update client authenticates metadata before downloading and rejects redirects, foreign URLs and corrupted bytes',async()=>{
 const {publicKey,privateKey}=generateKeyPairSync('ed25519'),config={origin:'https://updates.example.test',manifestUrl:'https://updates.example.test/latest.json',publisherPublicKey:publicKey.export({type:'spki',format:'pem'})},artifact=Buffer.from('fixture installer');
 const manifest=Buffer.from(JSON.stringify({version:'1.0.1',url:config.origin+'/Setup.exe',size:artifact.length,sha256:createHash('sha256').update(artifact).digest('hex'),expires:Date.now()+60000})),signature=sign(null,manifest,privateKey);
 let calls=[],mode='valid';const client=new UpdateClient(config,'1.0.0',async(url,options)=>{calls.push(url);assert.equal(options.redirect,'error');assert.equal(options.credentials,'omit');if(url.endsWith('.sig'))return new Response(mode==='signature'?Buffer.alloc(64):signature);if(url.endsWith('.json'))return new Response(manifest);return mode==='redirect'?new Response(null,{status:302,headers:{Location:'https://other.test'}}):new Response(mode==='corrupt'?Buffer.from('corrupt'):artifact)});
 const release=await client.check(AbortSignal.timeout(1000));assert.equal(calls.length,2);assert.deepEqual(await client.download(release,AbortSignal.timeout(1000)),artifact);
 mode='signature';calls=[];await assert.rejects(client.check(AbortSignal.timeout(1000)));assert.equal(calls.some(u=>u.endsWith('.exe')),false);
 for(mode of ['corrupt','redirect'])await assert.rejects(client.download(release,AbortSignal.timeout(1000)));
 assert.throws(()=>new UpdateClient({...config,manifestUrl:'https://other.test/latest.json'},'1.0.0',()=>{}));
});
