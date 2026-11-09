import {mkdir,open,rename,unlink} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import type {OsCipher} from '../security/vault';
import {record,exactKeys} from '../security/ipc';
const statuses=['created','running','awaiting-approval','completed','failed','interrupted','cancelled'] as const;
const reasons=['none','approval-denied','page-changed','network','auth','limit','model','response','execution-unconfirmed','stopped','step-limit','model-no-action','restored'] as const;
const operations=['CLICK','FILL','SELECT','SCROLL','NAVIGATE','WAIT','READ','EXTRACT','VERIFY','HANDOFF'] as const;
type Reason=typeof reasons[number];
type Outcome='observed'|'dispatched'|'unconfirmed';
export type TaskEvent={type:'created'}|{type:'running';origin:string;step:number}|{type:'awaiting-approval'}|{type:'completed'}|{type:'failed'|'interrupted';reason:Reason}|{type:'step';operation:string;outcome:Outcome;step:number};
export type TaskRecord={id:string;slot:number;kind:'draft'|'workflow';created:number;updated:number;status:typeof statuses[number];reason:Reason;origin:string;step:number;result:'none'|'model-completed'|Outcome;steps:{operation:typeof operations[number];outcome:Outcome;time:number;step:number}[]};
const idValid=(id:unknown):id is string=>typeof id==='string'&&/^[a-zA-Z0-9-]{1,64}$/.test(id);
const timestamp=(value:unknown):value is number=>Number.isSafeInteger(value)&&(value as number)>=0;
const originValid=(value:unknown):value is string=>{if(value==='')return true;if(typeof value!=='string'||value.length>512)return false;try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password&&u.origin===value;}catch{return false;}};
export function parseTaskRecords(value:unknown):TaskRecord[]|null {
  if(!record(value)||!exactKeys(value,['version','records'])||value.version!==1||!Array.isArray(value.records)||value.records.length>100)return null;
  const ids=new Set();for(const r of value.records){
    if(!record(r)||!exactKeys(r,['id','slot','kind','created','updated','status','reason','origin','step','result','steps'])||!idValid(r.id)||ids.has(r.id)||![1,2,3].includes(r.slot as number)||!['draft','workflow'].includes(r.kind as string)||!timestamp(r.created)||!timestamp(r.updated)||r.updated<r.created||!statuses.includes(r.status as TaskRecord['status'])||!reasons.includes(r.reason as Reason)||!originValid(r.origin)||!Number.isSafeInteger(r.step)||(r.step as number)<0||(r.step as number)>10||!['none','model-completed','observed','dispatched','unconfirmed'].includes(r.result as string)||!Array.isArray(r.steps)||r.steps.length>10)return null;
    if(!Array.from(r.steps).every(s=>record(s)&&exactKeys(s,['operation','outcome','time','step'])&&operations.includes(s.operation as typeof operations[number])&&['observed','dispatched','unconfirmed'].includes(s.outcome as string)&&timestamp(s.time)&&Number.isSafeInteger(s.step)&&(s.step as number)>=1&&(s.step as number)<=10))return null;ids.add(r.id);
  }
  return structuredClone(value.records) as TaskRecord[];
}
/** Deliberately cannot accept goals, model text, DOM values, tokens or arbitrary error strings. */
export class TaskJournal {
  status:'available'|'unavailable'|'failed'='unavailable';
  private records:TaskRecord[]=[];private writable=false;private latest:string|undefined;private writing:Promise<void>|undefined;
  constructor(private file:string,private cipher:OsCipher,private changed:()=>void=()=>{}){}
  snapshot():TaskRecord[]{return structuredClone(this.records);}
  async load():Promise<void>{
    try{
      this.writable=await this.cipher.available();this.status=this.writable?'available':'unavailable';if(!this.writable)return;
      const f=await open(this.file,'r');let data:Buffer;try{if((await f.stat()).size>1024*1024)throw Error();data=await f.readFile();}finally{await f.close();}
      const raw=await this.cipher.decrypt(data);if(raw.length>512*1024)throw Error();const parsed=parseTaskRecords(JSON.parse(raw));if(!parsed)throw Error();
      this.records=parsed.map(r=>['running','awaiting-approval','created'].includes(r.status)?{...r,status:'interrupted',reason:'restored',updated:Math.max(Date.now(),r.updated)}:r);this.save();
    }catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT'){this.status='failed';this.writable=false;}}finally{this.changed();}
  }
  create(slot:number,kind:TaskRecord['kind'],id=randomUUID()):string{
    if(![1,2,3].includes(slot)||!idValid(id)||this.records.some(r=>r.id===id))throw Error('Invalid task metadata');
    const now=Date.now();this.records.unshift({id,slot,kind,created:now,updated:now,status:'created',reason:'none',origin:'',step:0,result:'none',steps:[]});this.records=this.records.slice(0,100);this.save();return id;
  }
  apply(id:string,event:Exclude<TaskEvent,{type:'created'}>):void{
    const r=this.records.find(r=>r.id===id);if(!r)return;
    if(event.type==='running'){if(!originValid(event.origin)||!Number.isSafeInteger(event.step)||event.step<0||event.step>10)return;r.kind='workflow';r.status='running';r.origin=event.origin;r.step=event.step;r.reason='none';}
    else if(event.type==='step'){if(!operations.includes(event.operation as typeof operations[number])||!['observed','dispatched','unconfirmed'].includes(event.outcome)||!Number.isSafeInteger(event.step)||event.step<1||event.step>10)return;if(r.steps.some(s=>s.step===event.step))return;r.steps.push({operation:event.operation as typeof operations[number],outcome:event.outcome,time:Date.now(),step:event.step});r.result=event.outcome;}
    else if(event.type==='awaiting-approval'){r.status='awaiting-approval';}
    else if(event.type==='completed'){r.status='completed';r.result='model-completed';r.reason='none';}
    else {if(!reasons.includes(event.reason))return;r.status=event.type;r.reason=event.reason;}
    r.updated=Math.max(r.created,Date.now());this.save();
  }
  cancelDraft(id:string):void{const r=this.records.find(r=>r.id===id);if(r?.status==='created'){r.status='cancelled';r.updated=Date.now();this.save();}}
  private save():void{
    if(this.writable){this.latest=JSON.stringify({version:1,records:this.records});if(!this.writing)this.writing=this.drain().finally(()=>{this.writing=undefined;});}this.changed();
  }
  private async drain():Promise<void>{while(this.latest){const value=this.latest;this.latest=undefined;const temp=`${this.file}.${randomUUID()}.tmp`;try{const bytes=await this.cipher.encrypt(value);await mkdir(path.dirname(this.file),{recursive:true,mode:0o700});const f=await open(temp,'wx',0o600);try{await f.writeFile(bytes);await f.sync();}finally{await f.close();}await rename(temp,this.file);this.status='available';}catch{this.status='failed';}finally{await unlink(temp).catch(()=>{});}}this.changed();}
  async flush():Promise<void>{await this.writing;}
}
