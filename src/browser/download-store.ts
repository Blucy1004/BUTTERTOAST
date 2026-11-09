import {mkdir,open,rename,unlink} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {OsCipher} from '../security/vault';
import {record,exactKeys} from '../security/ipc';
export type SavedDownload={id:string;name:string;origin:string;received:number;total:number;state:string;paused:boolean;protection:'pending'|'marked'|'unavailable'|'not-applicable';path:string};
export function parseDownloads(value:unknown):SavedDownload[]|null {
 if(!Array.isArray(value)||value.length>100)return null;const seen=new Set<string>();
 for(const e of value){
  if(!record(e)||!exactKeys(e,['id','name','origin','received','total','state','paused','protection','path'])||typeof e.id!=='string'||!/^[a-f0-9-]{36}$/.test(e.id)||seen.has(e.id)||typeof e.name!=='string'||e.name.length>255||typeof e.path!=='string'||e.path.length>4096||/[\u0000-\u001f\u007f]/.test(e.path)||!path.isAbsolute(e.path)||path.basename(e.path)!==e.name||typeof e.origin!=='string'||!['completed','cancelled','interrupted','progressing','verifying','interrupted-after-restart'].includes(e.state as string)||e.paused!==false||!['pending','marked','unavailable','not-applicable'].includes(e.protection as string)||![e.received,e.total].every(n=>typeof n==='number'&&Number.isSafeInteger(n)&&n>=0))return null;
  try{const url=new URL(e.origin);if(!['http:','https:'].includes(url.protocol)||url.origin!==e.origin)return null;}catch{return null;}seen.add(e.id);
 }
 return structuredClone(value) as SavedDownload[];
}
export class DownloadStore {
 status:'available'|'unavailable'|'failed'='unavailable';private available=false;private writing:Promise<void>|null=null;private latest:SavedDownload[]|null=null;
 constructor(private file:string,private cipher:OsCipher){}
 async load():Promise<SavedDownload[]> {
  try{this.available=await this.cipher.available();this.status=this.available?'available':'unavailable';if(!this.available)return [];
   const handle=await open(this.file,'r');let bytes:Buffer;try{if((await handle.stat()).size>1024*1024)throw Error();bytes=await handle.readFile();}finally{await handle.close();}
   const text=await this.cipher.decrypt(bytes);if(text.length>768*1024)throw Error();const parsed=parseDownloads(JSON.parse(text));if(!parsed)throw Error();return parsed;
  }catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')this.status='failed';return [];}
 }
 save(value:SavedDownload[]):void {const parsed=parseDownloads(value);if(!parsed||!this.available)return;this.latest=parsed;if(!this.writing)this.writing=this.drain().finally(()=>{this.writing=null;});}
 private async drain():Promise<void> {
  while(this.latest){const payload=this.latest;this.latest=null;const temp=`${this.file}.${randomUUID()}.tmp`;
   try{const bytes=await this.cipher.encrypt(JSON.stringify(payload));await mkdir(path.dirname(this.file),{recursive:true,mode:0o700});const handle=await open(temp,'wx',0o600);try{await handle.writeFile(bytes);await handle.sync();}finally{await handle.close();}await rename(temp,this.file);this.status='available';}catch{this.status='failed';}finally{await unlink(temp).catch(()=>{});}
  }
 }
 async flush():Promise<void>{await this.writing;}
}
