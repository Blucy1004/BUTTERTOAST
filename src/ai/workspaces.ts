import type {BrowserWindow} from 'electron';
import type {BrowserTabs} from '../browser/tabs';
import {AiPanel} from './panel';
import type {Bounds} from '../browser/workspace';
/** Independent provider credentials, model requests, conversation and task storage for each slot. */
export class AiWorkspaces {
  private panels:AiPanel[]=[];
  private selected=0;
  private bounds:Bounds={x:0,y:80,width:420,height:650};private visible=true;
  constructor(private parent:BrowserWindow,private tabs:BrowserTabs,private audit:(origin:string,operation:string,outcome:string)=>void,private visibility:(visible:boolean)=>void=()=>{}){this.panels.push(new AiPanel(parent,tabs,audit,1,visibility));}
  slot():number{return this.selected+1;}
  toggle():void{this.panels[this.selected].toggle();}
  open():void{this.panels[this.selected].open();}
  isOpen():boolean{return this.panels[this.selected].isOpen();}
  delegate(id:number):Promise<void>{return this.panels[this.selected].delegate(id);}
  setPresentation(bounds:Bounds,visible:boolean):void{this.bounds=bounds;this.visible=visible;for(let i=0;i<this.panels.length;i++)this.panels[i]?.setPresentation(bounds,visible&&i===this.selected);}
  next():void{
    this.panels[this.selected].hideForSwitch();this.selected=(this.selected+1)%3;
    if(!this.panels[this.selected])this.panels[this.selected]=new AiPanel(this.parent,this.tabs,this.audit,this.selected+1,this.visibility);
    this.setPresentation(this.bounds,this.visible);
    this.panels[this.selected].open();
  }
  observe():void{for(const panel of this.panels)panel.observe();}
  layout():void{this.panels[this.selected].layout();}
  async flush():Promise<void>{await Promise.all(this.panels.map(p=>p.flush()));}
  dispose():void{for(const panel of this.panels)panel.dispose();}
}
