// Server-only. Never bundle service-role credentials into the Electron application.
const uuid=value=>typeof value==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value);
const reply=(status,error)=>Response.json({status:error},{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
async function jsonLimited(response,limit){
 const reader=response.body?.getReader();if(!reader)throw Error('body');let total=0;const chunks=[];
 try{for(;;){const {done,value}=await reader.read();if(done)break;total+=value.byteLength;if(total>limit){await reader.cancel();throw Error('size')}chunks.push(value)}}finally{reader.releaseLock()}
 const bytes=new Uint8Array(total);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}return JSON.parse(new TextDecoder().decode(bytes));
}
export function deletionHandler({origin,serviceKey,fetcher=fetch}){
 const url=new URL(origin);if(url.protocol!=='https:'||url.origin!==origin||!serviceKey)throw Error('Invalid server configuration');
 return async request=>{
  if(request.method!=='POST')return reply(405,'method-not-allowed');
  if(request.headers.get('origin'))return reply(403,'native-client-required');
  if(!request.headers.get('content-type')?.startsWith('application/json'))return reply(415,'json-required');
  const authorization=request.headers.get('authorization');if(!authorization||!/^Bearer [^\s]{16,16384}$/.test(authorization))return reply(401,'authentication-required');
  let body;try{body=await jsonLimited(request,8192)}catch{return reply(400,'invalid-request')}
  if(!body||Array.isArray(body)||Object.keys(body).sort().join(',')!=='confirmation,password'||body.confirmation!=='DELETE'||typeof body.password!=='string'||body.password.length<8||body.password.length>1024)return reply(400,'invalid-request');
  const api=(route,method,bearer,payload)=>fetcher(`${origin}/auth/v1/${route}`,{method,headers:{apikey:serviceKey,Authorization:bearer,'Content-Type':'application/json'},body:payload?JSON.stringify(payload):undefined,redirect:'error',credentials:'omit',signal:AbortSignal.timeout(8000)});
  let reauthAccess;
  try{
   const identity=await api('user','GET',authorization);if(!identity.ok)return reply(401,'authentication-required');
   const user=await jsonLimited(identity,65536);if(!uuid(user.id)||typeof user.email!=='string'||!user.email_confirmed_at)return reply(401,'verified-account-required');
   // Require fresh email/password verification for this exact server-validated account.
   const fresh=await api('token?grant_type=password','POST',`Bearer ${serviceKey}`,{email:user.email,password:body.password});body.password='';
   if(!fresh.ok)return reply(fresh.status===429?429:403,'reauthentication-required');
   const session=await jsonLimited(fresh,65536);reauthAccess=session.access_token;
   if(!session.user||session.user.id!==user.id||session.user.email!==user.email||typeof reauthAccess!=='string')return reply(403,'identity-mismatch');
   const deleted=await api(`admin/users/${user.id}`,'DELETE',`Bearer ${serviceKey}`);if(!deleted.ok)return reply(502,'deletion-not-confirmed');
   return reply(200,'auth-account-deleted');
  }catch{return reply(502,'deletion-not-confirmed')}
  finally{body.password='';if(typeof reauthAccess==='string')await api('logout?scope=local','POST',`Bearer ${reauthAccess}`).catch(()=>{});}
 };
}
