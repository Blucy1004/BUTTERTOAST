import {app,BrowserWindow,dialog,session,shell} from 'electron';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {UpdateClient} from '../security/update-client';
import {RELEASE_CONFIG} from '../security/release-config';
import {hardenSession} from '../security/electron';
export class BrowserUpdates {
  private client?:UpdateClient;
  private release?:Awaited<ReturnType<UpdateClient['check']>>;
  private abort?:AbortController;
  private timer?:NodeJS.Timeout;
  private disposed=false;
  private state={configured:false,busy:false,version:'',message:'이 개발 빌드에는 업데이트 서버와 게시자 공개키가 설정되지 않았습니다.'};
  constructor(private parent:BrowserWindow,private changed:()=>void){
    if(!RELEASE_CONFIG.origin)return;
    try {
      const network=session.fromPartition('toast-update-network');hardenSession(network);let expected='';
      network.webRequest.onBeforeRequest((details,callback)=>callback({cancel:details.method!=='GET'||details.url!==expected}));
      this.client=new UpdateClient(RELEASE_CONFIG,app.getVersion(),(url,options)=>{expected=url;return network.fetch(url,options);});
      this.state.configured=true;this.state.message='서명된 업데이트를 확인할 수 있습니다.';
      if(app.isPackaged){this.timer=setTimeout(()=>{void this.check();},30000);this.timer.unref();}
    }catch{this.state.message='업데이트 설정 검증에 실패했습니다.';}
  }
  snapshot(){return {...this.state};}
  async check():Promise<void>{
    if(this.disposed||!this.client||this.state.busy)return;this.state.busy=true;this.release=undefined;this.state.version='';this.changed();this.abort=new AbortController();
    try {this.release=await this.client.check(AbortSignal.any([this.abort.signal,AbortSignal.timeout(20000)]));this.state.version=this.release.info.version;this.state.message='새 버전의 게시자 서명을 확인했습니다.';}
    catch{this.state.message='유효한 새 업데이트를 확인하지 못했습니다. 연결·서명·버전을 확인하세요.';}finally{this.state.busy=false;this.changed();}
  }
  async install():Promise<void>{
    if(this.disposed||!this.client||!this.release||this.state.busy||this.parent.isDestroyed())return;
    if(process.platform!=='win32'||!app.isPackaged){this.state.message='설치는 패키징된 Windows 앱에서 지원합니다.';this.changed();return;}
    this.state.busy=true;this.changed();let directory='';let launched=false;
    try {
      const answer=await dialog.showMessageBox(this.parent,{type:'question',title:'ButterToast 업데이트',message:`${this.release.info.version} 버전을 내려받아 설치할까요?`,detail:'게시자 서명과 파일 해시를 검증한 후 앱을 닫고 설치 프로그램을 엽니다.',buttons:['취소','검증 후 설치'],defaultId:0,cancelId:0,noLink:true});
      if(answer.response!==1||this.disposed)return;
      this.abort=new AbortController();const bytes=await this.client.download(this.release,AbortSignal.any([this.abort.signal,AbortSignal.timeout(180000)]));
      if(this.disposed)throw Error('Update stopped');
      directory=await mkdtemp(path.join(app.getPath('temp'),'buttertoast-update-'));const file=path.join(directory,'ButterToast-Setup.exe');await writeFile(file,bytes,{flag:'wx',mode:0o600});
      const reread=await readFile(file);if(createHash('sha256').update(reread).digest('hex')!==this.release.info.sha256)throw Error('Changed installer');
      if(this.disposed)throw Error('Update stopped');if(await shell.openPath(file))throw Error('Installer launch failed');launched=true;app.quit();
    }catch{this.state.message='업데이트를 설치하지 못했습니다. 현재 버전은 유지합니다.';}
    finally{if(directory&&!launched)await rm(directory,{recursive:true,force:true});this.state.busy=false;this.changed();}
  }
  dispose(){this.disposed=true;clearTimeout(this.timer);this.abort?.abort();}
}
