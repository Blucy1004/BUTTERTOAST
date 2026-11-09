import {app} from 'electron';
import path from 'node:path';
import {osCipher} from '../security/os-cipher';
import {TaskJournal} from './task-journal';
import type {BrowserWindow} from 'electron';
import type {BrowserTabs} from '../browser/tabs';
import {AiPanel} from './panel';
import type {Bounds} from '../browser/workspace';
import type {UiAppearance} from '../profile/appearance';
/** Independent provider credentials, model requests, conversation and task storage for each slot. */
export class AiWorkspaces {
  private panels:AiPanel[]=[];
  private journal:TaskJournal;
  private selected=0;
  private bounds:Bounds={x:0,y:80,width:420,height:650};private visible=true;
  constructor(private parent:BrowserWindow,private tabs:BrowserTabs,private audit:(origin:string,operation:string,outcome:string)=>void,private visibility:(visible:boolean)=>void=()=>{},private appearance?:UiAppearance,private changed:()=>void=()=>{}){this.journal=new TaskJournal(path.join(app.getPath('userData'),'tasks.enc'),osCipher,()=>{for(const panel of this.panels)panel.historyChanged();this.changed();});this.panels.push(new AiPanel(parent,tabs,audit,1,visibility,appearance,this.journal));}
  initialize():Promise<void>{return this.journal.load();}
  recent(){return this.journal.snapshot().slice(0,6);}
  history(id:string):void{const record=this.journal.snapshot().find(r=>r.id===id);if(!record)return;this.panels[this.selected].hideForSwitch();this.selected=record.slot-1;if(!this.panels[this.selected])this.panels[this.selected]=new AiPanel(this.parent,this.tabs,this.audit,record.slot,this.visibility,this.appearance,this.journal);this.setPresentation(this.bounds,this.visible);this.panels[this.selected].showHistory(id);}
  draft(text:string,kind:'text'|'link'|'selection'='text'):void{this.panels[this.selected].draft(text,kind);}
  slot():number{return this.selected+1;}
  toggle():void{this.panels[this.selected].toggle();}
  open():void{this.panels[this.selected].open();}
  isOpen():boolean{return this.panels[this.selected].isOpen();}
  delegate(id:number):Promise<void>{return this.panels[this.selected].delegate(id);}
  setPresentation(bounds:Bounds,visible:boolean):void{this.bounds=bounds;this.visible=visible;for(let i=0;i<this.panels.length;i++)this.panels[i]?.setPresentation(bounds,visible&&i===this.selected);}
  next():void{
    this.panels[this.selected].hideForSwitch();this.selected=(this.selected+1)%3;
    if(!this.panels[this.selected])this.panels[this.selected]=new AiPanel(this.parent,this.tabs,this.audit,this.selected+1,this.visibility,this.appearance,this.journal);
    this.setPresentation(this.bounds,this.visible);
    this.panels[this.selected].open();
  }
  observe():void{for(const panel of this.panels)panel.observe();}
  stopAll():void{for(const panel of this.panels)panel.emergencyStop();}
  layout():void{this.panels[this.selected].layout();}
  async flush():Promise<void>{this.stopAll();await Promise.all([...this.panels.map(p=>p.flush()),this.journal.flush()]);}
  dispose():void{for(const panel of this.panels)panel.dispose();}
}
