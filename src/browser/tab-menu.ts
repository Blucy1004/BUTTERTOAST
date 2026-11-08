import { BrowserWindow, Menu, dialog } from 'electron';
import { BrowserTabs } from './tabs';

/** Menu items resolve existing main-owned tab IDs; UI cannot submit scripts or URLs. */
export class TabMenu {
  private confirming = false;
  constructor(private window:BrowserWindow,private tabs:BrowserTabs,private delegate:(id:number)=>void){}
  open(id:number):void {
    const tab=this.tabs.state().tabs.find(t=>t.id===id);if(!tab)return;
    Menu.buildFromTemplate([
      {label:tab.pinned?'탭 고정 해제':'탭 고정',click:()=>this.tabs.pin(id)},
      {label:tab.muted?'소리 켜기':'탭 음소거',click:()=>this.tabs.mute(id)},
      {label:'탭 복제 (주소만)',click:()=>this.tabs.duplicate(id)},
      {label:'Toast에 보내기',click:()=>this.delegate(id)},
      {type:'separator'},
      {label:'다른 탭 닫기 (고정 탭 유지)',enabled:this.tabs.closableOthers(id).length>0,click:()=>{void this.closeOthers(id);}},
      {label:'탭 닫기',click:()=>this.tabs.close(id)}
    ]).popup({window:this.window});
  }
  async closeOthers(id:number):Promise<void> {
    if(this.confirming)return;
    const candidates=this.tabs.closableOthers(id);if(!candidates.length)return;
    this.confirming=true;
    try {
      const {response}=await dialog.showMessageBox(this.window,{type:'warning',title:'다른 탭 닫기',message:`고정되지 않은 다른 탭 ${candidates.length}개를 닫을까요?`,detail:'저장하지 않은 입력 내용은 사라질 수 있습니다. 닫은 탭 다시 열기는 주소만 복원합니다.',buttons:['취소','탭 닫기'],defaultId:0,cancelId:0,noLink:true});
      if(response!==1||this.window.isDestroyed())return;
      const eligible=new Set(this.tabs.closableOthers(id));
      this.tabs.closeMany(candidates.filter(id=>eligible.has(id)));
    }finally{this.confirming=false;}
  }
}
