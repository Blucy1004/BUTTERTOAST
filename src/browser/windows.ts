import {app,BrowserWindow,ipcMain} from 'electron';
import path from 'node:path';
import {WEB_PREFERENCES} from '../security/electron';
import {parseCommand,RateGate} from '../security/ipc';
import {resolveAddress,isWebUrl} from '../policy';
import {TabSessionStore,SessionSnapshot} from './session-store';
import {osCipher} from '../security/os-cipher';
import {BrowserTabs} from './tabs';
import {BrowserLibrary} from './library';
import {UiAppearance} from '../profile/appearance';
import {showPageMenu} from './file-menu';
export const BROWSE_URL='toast-ui://app/browse.html';
/** Additional human windows use the same human profile, and their own strictly bound toolbar. */
export class BrowserWindows {
  private windows=new Map<BrowserWindow,BrowserTabs>();
  private slots=new Map<BrowserWindow,number>();private quitting=false;private restored:(SessionSnapshot|null)[]=[];
  private stores=Array.from({length:8},(_,i)=>new TabSessionStore(path.join(app.getPath('userData'),`window-tabs-${i+1}.enc`),osCipher));
  constructor(private owner:BrowserWindow,private library:BrowserLibrary,private appearance:UiAppearance,private openDownloads:()=>void=()=>{},private primary?:BrowserTabs,private commands:()=>void=()=>{}){}
  async initialize():Promise<void>{this.restored=await Promise.all(this.stores.map(store=>store.load()));}
  restore():void{if(!this.library.settings().restoreTabs)return;this.restored.forEach((snapshot,slot)=>{if(snapshot&&snapshot.tabs.some(t=>typeof t==='string'?!!t:!!t.url))this.open('',undefined,snapshot,slot);});this.restored=[];}
  configure():void{for(const tabs of this.windows.values())tabs.configureMemorySaver(this.library.settings().memorySaver);if(!this.library.settings().restoreTabs)for(const store of this.stores)void store.save({version:1,active:0,tabs:['']});}
  private prepareQuit():void{this.quitting=true;for(const [win,tabs] of this.windows)if(this.library.settings().restoreTabs)void this.stores[this.slots.get(win)!].save(tabs.snapshot());}
  async flush():Promise<void>{this.prepareQuit();await Promise.all(this.stores.map(store=>store.flush()));}
  detach(source:BrowserTabs,id:number):void {this.open('',{source,id});}
  open(url='',transfer?:{source:BrowserTabs;id:number},restored?:SessionSnapshot,restoreSlot?:number):void {
    if(url&&!isWebUrl(url)||this.owner.isDestroyed()||this.windows.size>=8)return;
    const slot=restoreSlot??this.stores.findIndex((_,i)=>![...this.slots.values()].includes(i));if(slot<0)return;
    const win=new BrowserWindow({show:false,width:1100,height:760,minWidth:520,minHeight:360,autoHideMenuBar:true,backgroundColor:'#0d1732',webPreferences:{...WEB_PREFERENCES,session:this.owner.webContents.session,preload:path.join(__dirname,'..','preload.js')}});
    const ui=win.webContents,gate=new RateGate();let tabs:BrowserTabs;
    const emit=()=>{if(!win.isDestroyed()&&tabs){const [width,height]=win.getContentSize();tabs.setViewport({x:0,y:58,width,height:Math.max(0,height-58)});ui.send('browser:state',{...tabs.state(),initialized:true});}};
    const input=(wc:Electron.WebContents)=>{
      const cleanups:(()=>void)[]=[];const on:Electron.WebContents['on']=(event:any,listener:any)=>{wc.on(event,listener);cleanups.push(()=>wc.removeListener(event,listener));return wc;};
      on('before-input-event',(event,key)=>{if(key.type!=='keyDown'||key.alt)return;const mod=process.platform==='darwin'?key.meta:key.control,k=key.key.toLowerCase();let act:(()=>void)|undefined;
        if(mod&&k==='l')act=()=>{ui.focus();ui.send('browser:focus-address');};
        if(mod&&k==='r')act=()=>tabs.history(key.shift?'reload-hard':'reload');
        if(mod&&k==='k')act=()=>{this.owner.focus();this.commands();};
        if(mod&&k==='j')act=this.openDownloads;
        if(mod&&k==='w')act=()=>win.close();
        if(k==='f11')act=()=>win.setFullScreen(!win.isFullScreen());
        if(k==='escape')act=()=>tabs.history('stop');
        if(act){event.preventDefault();act();}
      });
      on('context-menu',(_event,params)=>{const link=params.linkURL;showPageMenu(win,wc,params,isWebUrl(link)?[{label:'링크를 새 창에서 열기',click:()=>this.open(link)}]:[],()=>tabs.activeContents()===wc);});
      return ()=>{for(const off of cleanups)off();};
    };
    tabs=new BrowserTabs(win,{changed:emit,persist:snapshot=>{if(this.library.settings().restoreTabs)void this.stores[slot].save(snapshot);},input,visited:(url,title)=>this.library.visit(url,title)});
    this.windows.set(win,tabs);this.slots.set(win,slot);tabs.configureMemorySaver(this.library.settings().memorySaver);this.appearance.register(ui,BROWSE_URL);input(ui);
    ui.setWindowOpenHandler(()=>({action:'deny'}));ui.on('will-frame-navigate',e=>e.preventDefault());ui.on('will-redirect',e=>e.preventDefault());ui.on('will-attach-webview',e=>e.preventDefault());
    const handler=(event:Electron.IpcMainEvent,raw:unknown)=>{
      if(event.sender!==ui||event.senderFrame!==ui.mainFrame||event.senderFrame.url!==BROWSE_URL||!gate.allow())return;
      const cmd=parseCommand(raw);if(!cmd)return;
      if(cmd.type==='ready'){emit();return;}
      if(cmd.type==='tab-return'&&this.primary){if(tabs.transferTo(tabs.state().active,this.primary)){this.owner.focus();win.close();}else tabs.setError('주 창의 탭 또는 그룹 한도에 도달했습니다. 탭을 정리한 뒤 다시 이동하세요.');return;}
      if(cmd.type==='downloads-open'){this.openDownloads();return;}
      if(cmd.type==='navigate'){const address=resolveAddress(cmd.address,this.library.settings().search);if(address)tabs.navigate(address);else tabs.setError('HTTP 또는 HTTPS 주소를 입력하세요.');}
      if(['back','forward','reload','reload-hard','stop'].includes(cmd.type))tabs.history(cmd.type as 'back');
      if(cmd.type==='fullscreen')win.setFullScreen(!win.isFullScreen());
    };
    ipcMain.on('browser:command',handler);win.on('resize',emit);win.on('closed',()=>{ipcMain.removeListener('browser:command',handler);if(!this.quitting)void this.stores[slot].save({version:1,active:0,tabs:['']});tabs.dispose();this.windows.delete(win);this.slots.delete(win);});
    ui.once('did-finish-load',()=>{if(transfer){if(!transfer.source.transferTo(transfer.id,tabs)){win.close();return;}}else{tabs.initialize(restored??null);if(restored)tabs.select(tabs.state().active);if(url)tabs.navigate(url);}win.show();emit();});void win.loadURL(BROWSE_URL);
  }
  commandTabs(){return [...this.windows].flatMap(([win,tabs])=>tabs.commandTabs().map(t=>({...t,window:win.id})));}
  select(windowId:number,tabId:number):void{const entry=[...this.windows].find(([win])=>win.id===windowId);if(entry){entry[0].focus();entry[1].select(tabId);}}
  activeContents(wc:Electron.WebContents):boolean {return [...this.windows.values()].some(tabs=>tabs.activeContents()===wc);}
  dispose():void {this.prepareQuit();for(const win of this.windows.keys())if(!win.isDestroyed())win.destroy();this.windows.clear();}
}
