import { BrowserWindow, WebContentsView } from 'electron';
import type { Bounds } from '../browser/workspace';
import type { ActionPoint } from '../toastir/controller';
import { WEB_PREFERENCES } from '../security/electron';

export type VisualEvent = { id: number; time: number; document: string; operation: string; target: string; name: string; outcome: string; point?: ActionPoint };
/** A small trusted overlay; it never injects nodes, scripts or a bridge into a web page. */
export class CursorVisualizer {
  private view?: WebContentsView;
  private timer?: NodeJS.Timeout;
  private last?: {x:number;y:number};
  constructor(private parent: BrowserWindow, private interrupt: () => void) {}
  clear(): void { clearInterval(this.timer);this.timer=undefined;this.view?.setVisible(false);this.last=undefined; }
  show(event: VisualEvent, bounds: Bounds, speed: number, animate: boolean): void {
    const p=event.point;
    this.clear();
    // Do not replay a historical pointer over a different responsive layout.
    if(!p||!Object.values(p).every(Number.isFinite)||Math.abs(p.width-bounds.width)>2||Math.abs(p.height-bounds.height)>2||p.x<22||p.y<22||p.x>p.width-22||p.y>p.height-22)return;
    if(!this.view){
      this.view=new WebContentsView({webPreferences:{...WEB_PREFERENCES,session:this.parent.webContents.session}});
      this.view.setBackgroundColor('#00000000'); const wc=this.view.webContents;
      wc.setWindowOpenHandler(()=>({action:'deny'}));wc.on('will-frame-navigate',e=>e.preventDefault());wc.on('will-redirect',e=>e.preventDefault());
      wc.on('before-mouse-event',(_e,input)=>{if(input.type==='mouseDown'){this.clear();this.interrupt();}});
      this.parent.contentView.addChildView(this.view);void wc.loadURL('toast-ui://app/cursor.html').catch(()=>{});
    }
    this.parent.contentView.addChildView(this.view);
    const target={x:bounds.x+p.x,y:bounds.y+p.y},from=this.last??{x:Math.max(bounds.x+22,target.x-28),y:Math.max(bounds.y+22,target.y-18)};
    const start=performance.now(),duration=animate?160/Math.max(.1,speed):0;
    const render=()=>{
      if(this.parent.isDestroyed()||!this.view){this.clear();return;}
      const t=duration?Math.min(1,(performance.now()-start)/duration):1;
      const x=from.x+(target.x-from.x)*t,y=from.y+(target.y-from.y)*t;
      this.view.setBounds({x:Math.round(x-22),y:Math.round(y-22),width:44,height:44});
      this.view.setVisible(true);
      if(performance.now()-start>duration+220){this.clear();this.last=target;}
    };
    render();this.timer=setInterval(render,32);this.timer.unref();
  }
  dispose():void {this.clear();if(this.view){if(!this.parent.isDestroyed())this.parent.contentView.removeChildView(this.view);if(!this.view.webContents.isDestroyed())this.view.webContents.close({waitForBeforeUnload:false});this.view=undefined;}}
}
