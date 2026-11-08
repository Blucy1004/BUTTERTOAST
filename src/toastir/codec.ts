import {deflateRawSync,inflateRawSync} from 'node:zlib';
import {exactKeys,record} from '../security/ipc';
import type {Snapshot} from './controller';
const operations=new Set(['CLICK','FILL','SELECT','SCROLL','NAVIGATE','WAIT','READ','EXTRACT','VERIFY','HANDOFF']);
const MAX=512*1024;
export function validateSnapshot(v:unknown):Snapshot|null {
  if(!record(v)||!exactKeys(v,['document','version','origin','elements','text'])||typeof v.document!=='string'||!/^[\w-]{16,80}$/.test(v.document)||!Number.isSafeInteger(v.version)||(v.version as number)<0
    ||typeof v.origin!=='string'||typeof v.text!=='string'||v.text.length>12000||!Array.isArray(v.elements)||v.elements.length>500)return null;
  try {if(new URL(v.origin).origin!==v.origin||!v.origin.startsWith('https://'))return null;}catch{return null}
  const ids=new Set<string>();
  for(const e of v.elements){
    if(!record(e)||!exactKeys(e,['id','parent','role','name','visible','enabled','sensitive','actions'])||typeof e.id!=='string'||!/^e\d{1,9}$/.test(e.id)||ids.has(e.id)
      ||(e.parent!==null&&(typeof e.parent!=='string'||!/^e\d{1,9}$/.test(e.parent)))||e.parent===e.id||typeof e.role!=='string'||e.role.length>100||typeof e.name!=='string'||e.name.length>160
      ||typeof e.visible!=='boolean'||typeof e.enabled!=='boolean'||typeof e.sensitive!=='boolean'||!Array.isArray(e.actions)||e.actions.length>10||!e.actions.every(a=>operations.has(a)))return null;
    ids.add(e.id);
  }
  const parents=new Map(v.elements.map(e=>[e.id,e.parent]));
  for(const e of v.elements){let parent=e.parent,depth=0;while(parent!==null){if(!parents.has(parent)||++depth>500)return null;parent=parents.get(parent);}}
  return structuredClone(v) as Snapshot;
}
/** BTIR wire version 1, UTF-8 schema payload compressed with standard DEFLATE. Never sent as base64 to a model. */
export function encodeIR(snapshot:Snapshot):Buffer {
  const clean=validateSnapshot(snapshot);if(!clean)throw new Error('Invalid ToastIR');
  const bytes=Buffer.from(JSON.stringify(clean));if(bytes.length>MAX)throw new Error('IR too large');
  const header=Buffer.alloc(9);header.write('BTIR');header[4]=1;header.writeUInt32BE(bytes.length,5);
  return Buffer.concat([header,deflateRawSync(bytes)]);
}
export function decodeIR(bytes:Buffer):Snapshot {
  if(bytes.length<10||bytes.length>MAX||bytes.toString('ascii',0,4)!=='BTIR'||bytes[4]!==1||bytes.readUInt32BE(5)>MAX)throw new Error('Invalid ToastIR');
  const payload=inflateRawSync(bytes.subarray(9),{maxOutputLength:MAX});
  if(payload.length!==bytes.readUInt32BE(5))throw new Error('Invalid ToastIR');
  const parsed=validateSnapshot(JSON.parse(payload.toString('utf8')));if(!parsed)throw new Error('Invalid ToastIR');return parsed;
}
export type IRDelta={document:string;baseVersion:number;version:number;removed:string[];changed:Snapshot['elements'];text:string|null};
export function diffIR(before:Snapshot,after:Snapshot):IRDelta|null {
  if(before.document!==after.document||before.origin!==after.origin||after.version<before.version)return null;
  const old=new Map(before.elements.map(e=>[e.id,JSON.stringify(e)])),current=new Set(after.elements.map(e=>e.id));
  return {document:after.document,baseVersion:before.version,version:after.version,removed:before.elements.filter(e=>!current.has(e.id)).map(e=>e.id),changed:after.elements.filter(e=>old.get(e.id)!==JSON.stringify(e)),text:before.text===after.text?null:after.text};
}
