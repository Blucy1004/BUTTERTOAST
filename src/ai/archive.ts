import {mkdir,open,rename,unlink} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import type {OsCipher} from '../security/vault';
import type {ChatMessage} from './protocol';
import {record,exactKeys} from '../security/ipc';
function parseHistory(value:unknown):ChatMessage[]{
  if(!Array.isArray(value)||value.length>20||!value.every(m=>record(m)&&exactKeys(m,['role','content'])&&['user','assistant'].includes(m.role as string)&&typeof m.content==='string'&&m.content.length<=32000)||JSON.stringify(value).length>100000)throw Error('Invalid conversation');
  return structuredClone(value) as ChatMessage[];
}
/** Explicit owner save/load only. No automatic transcript persistence or plaintext fallback. */
export class ConversationArchive {
  private pending:Promise<unknown>=Promise.resolve();
  constructor(private file:string,private cipher:OsCipher){}
  private serial<T>(fn:()=>Promise<T>):Promise<T>{const next=this.pending.then(fn);this.pending=next.catch(()=>{});return next;}
  save(messages:ChatMessage[]):Promise<void>{const value=parseHistory(messages);return this.serial(async()=>{
    if(!await this.cipher.available())throw Error('Protected storage unavailable');const temp=`${this.file}.${randomUUID()}.tmp`;
    try{const encrypted=await this.cipher.encrypt(JSON.stringify(value));await mkdir(path.dirname(this.file),{recursive:true,mode:0o700});const handle=await open(temp,'wx',0o600);try{await handle.writeFile(encrypted);await handle.sync();}finally{await handle.close();}await rename(temp,this.file);}finally{await unlink(temp).catch(()=>{});}
  });}
  load():Promise<ChatMessage[]>{return this.serial(async()=>{
    if(!await this.cipher.available())throw Error('Protected storage unavailable');const handle=await open(this.file,'r');let bytes:Buffer;
    try{if((await handle.stat()).size>256*1024)throw Error('Conversation too large');bytes=await handle.readFile();}finally{await handle.close();}
    return parseHistory(JSON.parse(await this.cipher.decrypt(bytes)));
  });}
  delete():Promise<void>{return this.serial(async()=>{try{await unlink(this.file);}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw Error('Could not remove conversation');}});}
  async flush():Promise<void>{await this.pending;}
}
