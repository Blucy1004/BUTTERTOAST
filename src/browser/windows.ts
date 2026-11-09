import {BrowserWindow,ipcMain} from 'electron';
import path from 'node:path';
import {WEB_PREFERENCES} from '../security/electron';
import {parseCommand,RateGate} from '../security/ipc';
import {resolveAddress,isWebUrl} from '../policy';
import {BrowserTabs} from './tabs';
import {BrowserLibrary} from './library';
import {UiAppearance} from '../profile/appearance';
import {showPageMenu} from './file-menu';
export const BROWSE_URL='toast-ui://app/browse.html';
/** Additional human windows use the same human profile, and their own strictly bound toolbar. */
export class BrowserWindows {
  private windows=new Map<BrowserWindow,BrowserTabs>();
  constructor(private owner:BrowserWindow,private library:BrowserLibrary,private appearance:UiAppearance,private openDownloads:()=>void=()=>{}){}
  open(url=''):void {
    if(url&&!isWebUrl(url)||this.owner.isDestroyed()||this.windows.size>=8)return;
    const win=new BrowserWindow({show:false,width:1100,height:760,minWidth:520,minHeight:360,autoHideMenuBar:true,backgroundColor:'#0d1732',webPreferences:{...WEB_PREFERENCES,session:this.owner.webContents.session,preload:path.join(__dirname,'..','preload.js')}});
    const ui=win.webContents,gate=new RateGate();let tabs:BrowserTabs;
    const emit=()=>{if(!win.isDestroyed()&&tabs){const [width,height]=win.getContentSize();tabs.setViewport({x:0,y:58,width,height:Math.max(0,height-58)});ui.send('browser:state',{...tabs.state(),initialized:true});}};
    const input=(wc:Electron.WebContents)=>{
      wc.on('before-input-event',(event,key)=>{if(key.type!=='keyDown'||key.alt)return;const mod=process.platform==='darwin'?key.meta:key.control,k=key.key.toLowerCase();let act:(()=>void)|undefined;
        if(mod&&k==='l')act=()=>{ui.focus();ui.send('browser:focus-address');};
        if(mod&&k==='r')act=()=>tabs.history(key.shift?'reload-hard':'reload');
        if(mod&&k==='j')act=this.openDownloads;
        if(mod&&k==='w')act=()=>win.close();
        if(k==='f11')act=()=>win.setFullScreen(!win.isFullScreen());
        if(k==='escape')act=()=>tabs.history('stop');
        if(act){event.preventDefault();act();}
      });
      wc.on('context-menu',(_event,params)=>{const link=params.linkURL;showPageMenu(win,wc,params,isWebUrl(link)?[{label:'링크를 새 창에서 열기',click:()=>this.open(link)}]:[],()=>tabs.activeContents()===wc);});
    };
    tabs=new BrowserTabs(win,{changed:emit,persist:()=>{},input,visited:(url,title)=>this.library.visit(url,title)});
    this.windows.set(win,tabs);this.appearance.register(ui,BROWSE_URL);input(ui);
    ui.setWindowOpenHandler(()=>({action:'deny'}));ui.on('will-frame-navigate',e=>e.preventDefault());ui.on('will-redirect',e=>e.preventDefault());ui.on('will-attach-webview',e=>e.preventDefault());
    const handler=(event:Electron.IpcMainEvent,raw:unknown)=>{
      if(event.sender!==ui||event.senderFrame!==ui.mainFrame||event.senderFrame.url!==BROWSE_URL||!gate.allow())return;
      const cmd=parseCommand(raw);if(!cmd)return;
      if(cmd.type==='ready'){emit();return;}
      if(cmd.type==='downloads-open'){this.openDownloads();return;}
      if(cmd.type==='navigate'){const address=resolveAddress(cmd.address,this.library.settings().search);if(address)tabs.navigate(address);else tabs.setError('HTTP 또는 HTTPS 주소를 입력하세요.');}
      if(['back','forward','reload','reload-hard','stop'].includes(cmd.type))tabs.history(cmd.type as 'back');
      if(cmd.type==='fullscreen')win.setFullScreen(!win.isFullScreen());
    };
    ipcMain.on('browser:command',handler);win.on('resize',emit);win.on('closed',()=>{ipcMain.removeListener('browser:command',handler);tabs.dispose();this.windows.delete(win);});
    ui.once('did-finish-load',()=>{tabs.initialize(null);if(url)tabs.navigate(url);win.show();emit();});void win.loadURL(BROWSE_URL);
  }
  activeContents(wc:Electron.WebContents):boolean {return [...this.windows.values()].some(tabs=>tabs.activeContents()===wc);}
  dispose():void {for(const win of this.windows.keys())if(!win.isDestroyed())win.destroy();this.windows.clear();}
}
