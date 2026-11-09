import {mkdir,open,rename,unlink} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {OsCipher} from '../security/vault';
import {record,exactKeys} from '../security/ipc';
import {defaultProfile,Profile,parseProfile} from '../profile/model';
export type RememberedSession={id:string;email:string;refresh:string};
export type LocalProfile={profile:Profile;sync:boolean};
export interface AuthPersistence {
  available:boolean;
  profile(id:string):LocalProfile;
  saveProfile(id:string,value:LocalProfile):Promise<void>;
  loadSession():Promise<RememberedSession|null>;
  saveSession(value:RememberedSession|null):Promise<void>;
  flush():Promise<void>;
}
const userId=(id:unknown):id is string=>typeof id==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(id);
export function parseRemembered(value:unknown):RememberedSession|null {
  if(!record(value)||!exactKeys(value,['id','email','refresh'])||!userId(value.id)||typeof value.email!=='string'||value.email.length>254||!/^\S+@[^\s@]+\.[^\s@]+$/.test(value.email)||typeof value.refresh!=='string'||!value.refresh||value.refresh.length>4096||/[\u0000-\u0020\u007f]/.test(value.refresh))return null;
  return {id:value.id,email:value.email,refresh:value.refresh};
}
/** Two independent encrypted files: logout can erase credentials without deleting customization. */
export class AccountStorage implements AuthPersistence {
  available=false;private profiles=new Map<string,LocalProfile>();private pending:Promise<unknown>=Promise.resolve();
  constructor(private directory:string,private cipher:OsCipher){}
  private serial<T>(operation:()=>Promise<T>):Promise<T>{const next=this.pending.then(operation);this.pending=next.catch(()=>{});return next;}
  private async read(name:string):Promise<unknown> {
    if(!this.available)return null;
    try{const handle=await open(path.join(this.directory,name),'r');let bytes:Buffer;try{if((await handle.stat()).size>256*1024)throw Error();bytes=await handle.readFile();}finally{await handle.close();}const text=await this.cipher.decrypt(bytes);if(text.length>128*1024)throw Error();return JSON.parse(text);}catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')return null;throw new Error('Protected account data unavailable');}
  }
  private async write(name:string,value:unknown):Promise<void> {
    if(!this.available)throw new Error('OS protected storage unavailable');
    const file=path.join(this.directory,name),temp=`${file}.${randomUUID()}.tmp`;
    try{const bytes=await this.cipher.encrypt(JSON.stringify(value));await mkdir(this.directory,{recursive:true,mode:0o700});const handle=await open(temp,'wx',0o600);try{await handle.writeFile(bytes);await handle.sync();}finally{await handle.close();}await rename(temp,file);}catch{throw new Error('Protected account save failed');}finally{await unlink(temp).catch(()=>{});}
  }
  async load():Promise<void> {
    this.available=await this.cipher.available();if(!this.available)return;
    const raw=await this.read('profiles.enc');if(raw===null)return;
    if(!record(raw)||!exactKeys(raw,['version','profiles'])||raw.version!==1||!Array.isArray(raw.profiles)||raw.profiles.length>16)throw new Error('Invalid local profiles');
    const parsed=new Map<string,LocalProfile>();
    for(const row of raw.profiles){if(!record(row)||!exactKeys(row,['id','profile','sync'])||!userId(row.id)||typeof row.sync!=='boolean'||parsed.has(row.id))throw new Error('Invalid local profiles');const profile=parseProfile(row.profile);if(!profile)throw new Error('Invalid local profiles');parsed.set(row.id,{profile,sync:row.sync});}
    this.profiles=parsed;
  }
  profile(id:string):LocalProfile {return structuredClone(this.profiles.get(id)??{profile:defaultProfile(),sync:false});}
  saveProfile(id:string,value:LocalProfile):Promise<void> {
    const profile=parseProfile(value.profile);if(!userId(id)||!profile||typeof value.sync!=='boolean')return Promise.reject(new Error('Invalid local profile'));
    this.profiles.delete(id);this.profiles.set(id,{profile,sync:value.sync});if(this.profiles.size>16)this.profiles.delete(this.profiles.keys().next().value!);
    const copy={version:1,profiles:[...this.profiles].map(([id,value])=>({id,...structuredClone(value)}))};
    return this.serial(()=>this.write('profiles.enc',copy));
  }
  loadSession():Promise<RememberedSession|null> {return this.serial(async()=>{const value=await this.read('session.enc');if(value===null)return null;const parsed=parseRemembered(value);if(!parsed)throw new Error('Invalid remembered session');return parsed;});}
  saveSession(value:RememberedSession|null):Promise<void> {
    const copy=value?parseRemembered(value):null;if(value&&!copy)return Promise.reject(new Error('Invalid remembered session'));
    return this.serial(async()=>{if(copy)await this.write('session.enc',copy);else try{await unlink(path.join(this.directory,'session.enc'));}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw new Error('Stored session removal failed');}});
  }
  async flush():Promise<void>{await this.pending;}
}
