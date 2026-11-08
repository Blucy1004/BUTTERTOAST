import { ipcMain, nativeTheme, WebContents } from 'electron';
import { Appearance, defaultAppearance, parseAppearance } from './model';
import { RateGate } from '../security/ipc';

/** Only explicitly registered application views receive non-secret appearance preferences. */
export class UiAppearance {
  private options=defaultAppearance();
  private targets=new Map<WebContents,{url:string;gate:RateGate}>();
  private ready=(event:Electron.IpcMainEvent,...args:unknown[])=>{
    const target=this.targets.get(event.sender);
    if(args.length||!target||event.sender.isDestroyed()||event.senderFrame!==event.sender.mainFrame||event.senderFrame?.url!==target.url||!target.gate.allow())return;
    this.send(event.sender);
  };
  private updated=()=>this.broadcast();
  constructor(){ipcMain.on('appearance:ready',this.ready);nativeTheme.on('updated',this.updated);}
  state(){return {options:{...this.options},resolved:this.options.theme==='system'?(nativeTheme.shouldUseDarkColors?'dark':'light'):this.options.theme};}
  set(value:Appearance):void {const parsed=parseAppearance(value);if(!parsed||JSON.stringify(parsed)===JSON.stringify(this.options))return;this.options=parsed;this.broadcast();}
  register(wc:WebContents,url:string):void {
    if(!['toast-ui://app/index.html','toast-ui://app/account.html','toast-ui://app/manager.html','toast-ui://app/ai.html'].includes(url)||this.targets.has(wc))throw new Error('Unexpected UI target');
    this.targets.set(wc,{url,gate:new RateGate()});
    wc.on('did-finish-load',()=>this.send(wc));wc.once('destroyed',()=>this.targets.delete(wc));
  }
  private send(wc:WebContents):void {if(!wc.isDestroyed()&&wc.getURL()===this.targets.get(wc)?.url)wc.send('appearance:state',this.state());}
  private broadcast():void {for(const wc of this.targets.keys())this.send(wc);}
  dispose():void {ipcMain.removeListener('appearance:ready',this.ready);nativeTheme.removeListener('updated',this.updated);this.targets.clear();}
}
