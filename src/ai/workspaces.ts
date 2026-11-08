import type {BrowserWindow} from 'electron';
import type {BrowserTabs} from '../browser/tabs';
import {AiPanel} from './panel';
/** Independent provider credentials, model requests, conversation and task storage for each slot. */
export class AiWorkspaces {
  private panels:AiPanel[]=[];
  private selected=0;
  constructor(private parent:BrowserWindow,private tabs:BrowserTabs,private audit:(origin:string,operation:string,outcome:string)=>void){this.panels.push(new AiPanel(parent,tabs,audit));}
  slot():number{return this.selected+1;}
  toggle():void{this.panels[this.selected].toggle();}
  next():void{
    this.panels[this.selected].hideForSwitch();this.selected=(this.selected+1)%3;
    if(!this.panels[this.selected])this.panels[this.selected]=new AiPanel(this.parent,this.tabs,this.audit,this.selected+1);
    this.panels[this.selected].open();
  }
  observe():void{for(const panel of this.panels)panel.observe();}
  layout():void{this.panels[this.selected].layout();}
  async flush():Promise<void>{await Promise.all(this.panels.map(p=>p.flush()));}
  dispose():void{for(const panel of this.panels)panel.dispose();}
}
