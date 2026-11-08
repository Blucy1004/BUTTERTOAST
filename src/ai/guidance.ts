import {open} from 'node:fs/promises';
import path from 'node:path';
let cached:Promise<string>|undefined;
/** Fixed package paths only; never load instructions from cwd, websites or user-supplied files. */
export function trustedGuidance():Promise<string>{
  return cached??=Promise.all(['SYSTEM.md','ACTIONS.md','HANDOFF.md','RECOVERY.md'].map(async name=>{
    const handle=await open(path.join(__dirname,'..','guidance',name),'r');
    try{if((await handle.stat()).size>4000)throw Error('Guidance size');const text=await handle.readFile('utf8');if(!text.includes('protocol v2'))throw Error('Guidance version');return text;}finally{await handle.close();}
  })).then(parts=>parts.join('\n\n'));
}
