const http=require('node:http'),{createHash}=require('node:crypto');
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const page=`<!doctype html><meta charset="utf-8"><title>Local file transfer fixture</title>
<a id="download" href="/attachment" download>Download fixture</a>
<a id="inline" href="/inline">Inline file</a><img id="image" src="/image.svg" width="24" height="24">
<button id="blob">Export generated file</button><a id="slow" href="/slow" download>Slow download</a>
<form id="form" action="/upload" method="post" enctype="multipart/form-data">
<label for="files">Fixture files</label><input type="file" name="attachment" id="files" multiple><button id="submit">Upload</button></form>
<div id="drop" style="padding:40px;border:1px solid;width:220px" tabindex="0">Drop fixture files here</div><output id="status"></output>
<script>
window.changes=0;files.addEventListener('change',()=>changes++);
blob.onclick=()=>{const url=URL.createObjectURL(new Blob(['ButterToast export · 파일'],{type:'text/plain'}));window.exportURL=url;const a=document.createElement('a');a.href=url;a.download='export.txt';a.click();};
drop.ondragover=e=>e.preventDefault();drop.ondrop=async e=>{e.preventDefault();const body=new FormData();for(const f of e.dataTransfer.files)body.append('attachment',f);const r=await fetch('/upload',{method:'POST',body});document.getElementById('status').textContent=r.ok?'uploaded':'failed';};
</script>`;
async function start(){
 const uploads=[],bytes=Buffer.alloc(1024*1024,0x5a),requests=[];let base;
 const timers=new Set();
 const server=http.createServer(async(req,res)=>{
  requests.push({method:req.method,path:req.url});
  try {
   const pathname=new URL(req.url,base).pathname;
   if(pathname==='/upload'){
    if(req.method!=='POST')throw Error('Expected POST');
    const chunks=[];let length=0;for await(const chunk of req){length+=chunk.length;if(length>2*1024*1024)throw Error('Fixture size exceeded');chunks.push(chunk);}
    const request=new Request(base+'/upload',{method:'POST',headers:{'content-type':req.headers['content-type']},body:Buffer.concat(chunks)});
    const form=await request.formData(),files=[];
    for(const [field,file] of form){if(field!=='attachment'||typeof file==='string')throw Error('Unexpected form field');const bytes=Buffer.from(await file.arrayBuffer());files.push({name:file.name,size:bytes.length,sha256:sha(bytes)});}
    uploads.push(files);res.setHeader('Content-Type','text/html');res.end('<title>Upload received</title><p>Upload received</p>');return;
   }
   if(pathname==='/slow'){
    res.writeHead(200,{'Content-Type':'application/octet-stream','Content-Disposition':'attachment; filename="slow.bin"','Content-Length':bytes.length});
    let position=0;const timer=setInterval(()=>{const end=Math.min(position+16384,bytes.length);res.write(bytes.subarray(position,end));position=end;if(position===bytes.length){clearInterval(timer);timers.delete(timer);res.end();}},45);timers.add(timer);res.on('close',()=>{clearInterval(timer);timers.delete(timer);});return;
   }
   if(pathname==='/attachment'||pathname==='/inline'){
    if(pathname==='/attachment')res.setHeader('Content-Disposition','attachment; filename="fixture.txt"');
    res.setHeader('Content-Type','text/plain');res.end('ButterToast HTTP fixture');return;
   }
   if(pathname==='/image.svg'){res.setHeader('Content-Type','image/svg+xml');res.end('<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24"><rect width="24" height="24" fill="blue"/></svg>');return;}
   res.setHeader('Content-Type','text/html');res.end(page);
  }catch(e){res.statusCode=500;res.end('Local fixture error');}
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));base=`http://127.0.0.1:${server.address().port}`;
 return {base,uploads,bytes,requests,close:async()=>{for(const timer of timers)clearInterval(timer);server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}};
}
module.exports={start,sha,page};
