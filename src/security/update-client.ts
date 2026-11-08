import {createPublicKey} from 'node:crypto';
import {verifyManifest,verifyUpdate,UpdatePolicy} from './update';
export type ReleaseConfig={origin:string;manifestUrl:string;publisherPublicKey:string};
export class UpdateClient {
  private policy:UpdatePolicy;
  constructor(private config:ReleaseConfig,currentVersion:string,private fetcher:(url:string,options:RequestInit)=>Promise<Response>){
    const origin=new URL(config.origin),manifest=new URL(config.manifestUrl);
    if(origin.protocol!=='https:'||origin.origin!==config.origin||manifest.origin!==origin.origin||manifest.username||manifest.password||manifest.search||manifest.hash)throw Error('Update configuration rejected');
    this.policy={publisherKey:createPublicKey(config.publisherPublicKey),currentVersion,downloadOrigin:config.origin};
    if(this.policy.publisherKey.asymmetricKeyType!=='ed25519')throw Error('Update key rejected');
  }
  private async get(url:string,limit:number,signal:AbortSignal):Promise<Buffer>{
    const target=new URL(url);if(target.origin!==this.config.origin||target.protocol!=='https:'||target.username||target.password||target.hash)throw Error('Update URL rejected');
    const response=await this.fetcher(url,{method:'GET',redirect:'error',credentials:'omit',cache:'no-store',signal});
    if(!response.ok||response.redirected){await response.body?.cancel();throw Error('Update request failed');}
    const reader=response.body?.getReader();if(!reader)throw Error('Update response rejected');const chunks:Uint8Array[]=[];let size=0;
    try {for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>limit){await reader.cancel();throw Error('Update size rejected');}chunks.push(value);}return Buffer.concat(chunks);}finally{reader.releaseLock();}
  }
  async check(signal:AbortSignal){
    const manifest=await this.get(this.config.manifestUrl,8192,signal),signature=await this.get(this.config.manifestUrl+'.sig',64,signal);
    const info=verifyManifest(manifest,signature,this.policy);if(!new URL(info.url).pathname.endsWith('.exe'))throw Error('Installer format rejected');
    return {manifest,signature,info};
  }
  async download(release:Awaited<ReturnType<UpdateClient['check']>>,signal:AbortSignal):Promise<Buffer>{
    const info=verifyManifest(release.manifest,release.signature,this.policy);
    const bytes=await this.get(info.url,info.size,signal);return verifyUpdate(release.manifest,release.signature,bytes,this.policy).artifact;
  }
}
