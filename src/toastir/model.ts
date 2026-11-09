import {exactKeys,record} from '../security/ipc';
import type {PageContext} from '../ai/service';

/** The model sees data, never executable code or authorization. Rows avoid repeated property names. */
export type ModelRow=[string,string,string,string[]];
type Identity={schema:'toastir/1';source:PageContext['source'];origin:string;document:string;version:number};
export type ModelSnapshot=Identity&{format:'snapshot';fields:['id','role','name','actions'];text:string;elements:ModelRow[]};
export type ModelDelta=Identity&{format:'delta';baseVersion:number;text:string|null;removed:string[];changed:ModelRow[];order:string[]};
export type ModelFrame=ModelSnapshot|ModelDelta;
const operations=new Set(['CLICK','FILL','SELECT','SCROLL','NAVIGATE','WAIT','READ','EXTRACT','VERIFY','HANDOFF']);
const elementId=(v:unknown):v is string=>typeof v==='string'&&/^e\d{1,9}$/.test(v);
export function modelSnapshot(page:PageContext):ModelSnapshot|null {
  if(!page.document||typeof page.version!=='number'||!Number.isSafeInteger(page.version)||page.version<0)return null;
  const frame:ModelSnapshot={schema:'toastir/1',format:'snapshot',source:page.source,origin:page.origin,document:page.document,version:page.version!,fields:['id','role','name','actions'],
    text:page.text,elements:page.elements.map(e=>[e.id,e.role,e.name,[...(e.actions||[])]])};
  return parseModelFrame(frame)?.format==='snapshot'?frame:null;
}
export function parseModelFrame(value:unknown):ModelFrame|null {
  if(!record(value)||value.schema!=='toastir/1'||!['human','task','controlled'].includes(value.source as string)||typeof value.origin!=='string'||typeof value.document!=='string'||!/^[\w-]{16,80}$/.test(value.document)||!Number.isSafeInteger(value.version)||(value.version as number)<0)return null;
  try{if(new URL(value.origin).origin!==value.origin||!value.origin.startsWith('https://'))return null;}catch{return null;}
  const identity=['schema','format','source','origin','document','version'];
  const rows=value.format==='snapshot'?value.elements:value.changed;
  if(!Array.isArray(rows)||rows.length>100)return null;
  const ids=new Set<string>();
  for(const row of rows){if(!Array.isArray(row)||row.length!==4||!elementId(row[0])||ids.has(row[0])||typeof row[1]!=='string'||row[1].length>100||typeof row[2]!=='string'||row[2].length>160||!Array.isArray(row[3])||row[3].length>10||!row[3].every(op=>operations.has(op)))return null;ids.add(row[0]);}
  if(value.format==='snapshot'){
    if(!exactKeys(value,[...identity,'fields','text','elements'])||JSON.stringify(value.fields)!==JSON.stringify(['id','role','name','actions'])||typeof value.text!=='string'||value.text.length>12000)return null;
  }else if(value.format==='delta'){
    if(!exactKeys(value,[...identity,'baseVersion','text','removed','changed','order'])||!Number.isSafeInteger(value.baseVersion)||(value.baseVersion as number)<0||(value.baseVersion as number)>(value.version as number)
      ||!(value.text===null||typeof value.text==='string'&&value.text.length<=12000)||!Array.isArray(value.removed)||value.removed.length>100||!value.removed.every(elementId)||new Set(value.removed).size!==value.removed.length
      ||!Array.isArray(value.order)||value.order.length>100||!value.order.every(elementId)||new Set(value.order).size!==value.order.length||value.removed.some(id=>ids.has(id)||(value.order as string[]).includes(id)))return null;
  }else return null;
  return structuredClone(value) as ModelFrame;
}
export function modelDelta(before:ModelSnapshot,after:ModelSnapshot):ModelDelta|null {
  if(before.document!==after.document||before.origin!==after.origin||before.source!==after.source||after.version<before.version)return null;
  const old=new Map(before.elements.map(e=>[e[0],JSON.stringify(e)])),next=new Set(after.elements.map(e=>e[0]));
  return {schema:'toastir/1',format:'delta',source:after.source,origin:after.origin,document:after.document,baseVersion:before.version,version:after.version,
    text:before.text===after.text?null:after.text,removed:before.elements.filter(e=>!next.has(e[0])).map(e=>e[0]),changed:after.elements.filter(e=>old.get(e[0])!==JSON.stringify(e)),order:after.elements.map(e=>e[0])};
}
/** Reconstruct before accepting a delta; foreign, incomplete and replayed baselines fail closed. */
export function applyModelFrame(previous:ModelSnapshot|null,input:unknown):ModelSnapshot|null {
  const frame=parseModelFrame(input);if(!frame)return null;if(frame.format==='snapshot')return frame;
  if(!previous||!parseModelFrame(previous)||frame.document!==previous.document||frame.origin!==previous.origin||frame.source!==previous.source||frame.baseVersion!==previous.version)return null;
  const rows=new Map(previous.elements.map(e=>[e[0],e]));
  for(const id of frame.removed){if(!rows.delete(id))return null;}
  for(const row of frame.changed)rows.set(row[0],row);
  if(rows.size!==frame.order.length||frame.order.some(id=>!rows.has(id)))return null;
  const result:ModelSnapshot={schema:'toastir/1',format:'snapshot',source:frame.source,origin:frame.origin,document:frame.document,version:frame.version,fields:['id','role','name','actions'],text:frame.text??previous.text,elements:frame.order.map(id=>rows.get(id)!)};
  return parseModelFrame(result) as ModelSnapshot|null;
}
export function chooseModelFrame(current:ModelSnapshot,previous:ModelSnapshot|null):ModelFrame {
  if(!previous)return current;
  const delta=modelDelta(previous,current);
  if(!delta||JSON.stringify(applyModelFrame(previous,delta))!==JSON.stringify(current))return current;
  return Buffer.byteLength(JSON.stringify(delta))<Buffer.byteLength(JSON.stringify(current))?delta:current;
}
