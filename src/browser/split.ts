import type {Bounds} from './workspace';
/** One main-owned geometry for both native pages and the trusted divider. */
export function splitGeometry(bounds:Bounds,ratio:number,enabled:boolean):{left:Bounds;right:Bounds;divider:Bounds;leftHeader:Bounds;rightHeader:Bounds;visible:boolean}{
  const visible=enabled&&bounds.width>=420;
  const header=28,gap=10,usable=Math.max(0,bounds.width-gap),left=Math.round(usable*Math.min(.75,Math.max(.25,Number.isFinite(ratio)?ratio:.5)));
  return {left:visible?{...bounds,y:bounds.y+header,height:Math.max(0,bounds.height-header),width:left}:bounds,right:{...bounds,y:bounds.y+header,height:Math.max(0,bounds.height-header),x:bounds.x+left+gap,width:Math.max(0,usable-left)},leftHeader:{...bounds,width:left,height:header},rightHeader:{...bounds,x:bounds.x+left+gap,width:Math.max(0,usable-left),height:header},divider:{...bounds,x:bounds.x+left,width:gap},visible};
}
