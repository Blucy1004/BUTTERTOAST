import {BrowserWindow,dialog,WebContents,WebFrameMain} from 'electron';
import {isWebUrl} from '../policy';
type Pending={url:string;source:string;frame:WebFrameMain};
/** Block first; only an explicit native approval opens a detached tab without window.opener. */
export class PopupPolicy {
  private pending=new WeakMap<WebContents,Pending>();private busy=false;
  constructor(private owner:BrowserWindow,private openTab:(url:string)=>void,private changed:()=>void){}
  attach(wc:WebContents):void {
    wc.setWindowOpenHandler(details=>{
      if(!details.postBody&&isWebUrl(details.url)&&details.url.length<=4096&&isWebUrl(wc.getURL()))this.pending.set(wc,{url:details.url,source:wc.getURL(),frame:wc.mainFrame});
      this.changed();return {action:'deny'};
    });
    wc.on('did-start-navigation',event=>{if(event.isMainFrame){this.pending.delete(wc);this.changed();}});
  }
  blocked(wc:WebContents|undefined):boolean {return !!wc&&this.pending.has(wc);}
  async open(wc:WebContents|undefined):Promise<void> {
    if(!wc||wc.isDestroyed()||this.busy||this.owner.isDestroyed())return;const pending=this.pending.get(wc);if(!pending)return;
    this.pending.delete(wc);this.busy=true;this.changed();
    let revoked=false;
    const navigation=(event:{isMainFrame:boolean})=>{if(event.isMainFrame)revoked=true;};
    const revoke=()=>{revoked=true;};
    wc.on('did-start-navigation',navigation);wc.on('render-process-gone',revoke);wc.on('destroyed',revoke);
    try {
      const answer=await dialog.showMessageBox(this.owner,{type:'question',message:'차단한 팝업을 새 탭에서 열까요?',detail:`요청한 사이트: ${new URL(pending.source).origin}\n대상: ${pending.url}\n원래 창과 연결되지 않은 새 탭으로 열립니다.`,buttons:['취소','새 탭 열기'],defaultId:0,cancelId:0,noLink:true});
      if(answer.response===1&&!revoked&&!this.owner.isDestroyed()&&!wc.isDestroyed()&&!wc.isCrashed()&&wc.mainFrame===pending.frame&&wc.getURL()===pending.source)this.openTab(pending.url);
    }finally{wc.removeListener('did-start-navigation',navigation);wc.removeListener('render-process-gone',revoke);wc.removeListener('destroyed',revoke);this.busy=false;this.changed();}
  }
}
