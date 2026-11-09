// Test-only wire-compatible provider. Not imported by src/ or included in dist/.
// All traffic stays on a fresh loopback port; real credentials are rejected.
const http = require('node:http');
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const envelope = reply => ({choices:[{message:{content:typeof reply==='string'?reply:JSON.stringify(reply)}}],usage:{prompt_tokens:0,completion_tokens:0}});
class MockProvider {
  calls=[]; plans=[]; sockets=new Set(); handler=null;
  enqueue(...plans){this.plans.push(...plans);return this;}
  async start(){
    this.server=http.createServer(async(req,res)=>{
      const record={route:req.url,startedAt:Date.now(),body:null,aborted:false,completed:false};
      this.calls.push(record);res.on('close',()=>{record.aborted=!res.writableFinished;record.closedAt=Date.now()});
      if(req.headers.authorization||req.headers['x-api-key']){res.writeHead(403);res.end('Mock requires no credentials');return;}
      let body='';for await(const data of req){body+=data;if(Buffer.byteLength(body)>128*1024){res.writeHead(413);res.end();return;}}
      try{record.body=body?JSON.parse(body):null;}catch{res.writeHead(400);res.end();return;}
      if(req.url==='/v1/models'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({data:[{id:'mock-toast-test-only'}]}));record.completed=true;return;}
      if(req.url!=='/v1/chat/completions'||req.method!=='POST'){res.writeHead(404);res.end();return;}
      try{
        let plan=this.plans.shift()??this.handler;
        plan=typeof plan==='function'?await plan(record):plan;
        if(!plan)throw Error('Unexpected mock request: no response plan');
        if(plan.hang)return;
        if(plan.delayMs)await wait(Math.min(120000,Math.max(0,plan.delayMs)));
        if(res.destroyed)return;
        if(plan.disconnect){res.destroy();return;}
        res.writeHead(plan.status??200,{'Content-Type':plan.sse?'text/event-stream':'application/json',...(plan.headers??{})});
        const payload=plan.raw??(plan.sse
          ? ['data: '+JSON.stringify({choices:[{delta:{content:'{"done":true,'}}]}),'data: '+JSON.stringify({choices:[{delta:{content:'"reply":"STREAM","action":null}'}}]}),'data: [DONE]'].join('\n\n')+'\n\n'
          : JSON.stringify(envelope(plan.reply??{done:true,reply:'MOCK_COMPLETE',action:null})));
        const size=plan.chunkBytes??payload.length;
        for(let offset=0;offset<payload.length;offset+=size){if(res.destroyed)return;res.write(payload.slice(offset,offset+size));if(plan.chunkDelayMs)await wait(plan.chunkDelayMs);}
        if(plan.hangBody)return;
        res.end();record.completed=true;
      }catch(error){record.error=String(error.message);if(!res.headersSent)res.writeHead(500);res.end();}
    });
    this.server.on('connection',socket=>{this.sockets.add(socket);socket.on('close',()=>this.sockets.delete(socket));});
    await new Promise(resolve=>this.server.listen(0,'127.0.0.1',resolve));
    this.endpoint=`http://127.0.0.1:${this.server.address().port}/v1`;return this;
  }
  config(){return {provider:'compatible',endpoint:this.endpoint,key:''};}
  chats(){return this.calls.filter(call=>call.route==='/v1/chat/completions');}
  async close(){for(const socket of this.sockets)socket.destroy();if(this.server)await new Promise(resolve=>this.server.close(resolve));}
}
module.exports={MockProvider,wait};
