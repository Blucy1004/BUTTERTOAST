import type {WebContents} from 'electron';
import type {Result} from './controller';
import type {Proposal} from '../ai/protocol';

/** Trusted main host only. Observe a dispatched task's navigation without
 * transferring its approval or any data from the revoked document. AiService's
 * epoch still decides whether the caller may consume this result or continue.
 */
export async function settleTaskAction(contents:WebContents,origin:string,proposal:Proposal,current:()=>boolean,execute:()=>Promise<Result>):Promise<Result> {
  if(!['CLICK','NAVIGATE'].includes(proposal.op))return execute();
  let navigations=0,foreign=false,inputRevoked=false;
  const allowed=(value:string)=>{try{const url=new URL(value);return url.protocol==='https:'&&url.origin===origin&&!url.username&&!url.password;}catch{return false;}};
  const observe=(event:{isMainFrame:boolean;url:string})=>{if(event.isMainFrame){navigations++;if(navigations>8||!allowed(event.url))foreign=true;}};
  // The old attachment is disposed on navigation. Keep direct user input
  // authoritative during the gap before the next document capture is created.
  const keyboard=()=>{inputRevoked=true;};
  const mouse=(_event:unknown,input:Electron.MouseInputEvent)=>{if(input.type==='mouseDown')inputRevoked=true;};
  contents.on('did-start-navigation',observe);
  contents.on('before-input-event',keyboard);contents.on('before-mouse-event',mouse);
  try {
    const result=await execute();
    // No speculative retry: only a receipt from the exact validated dispatcher.
    if(!result.ok&&!result.dispatched)return result;
    if(!navigations&&proposal.op!=='NAVIGATE')return result;
    const deadline=performance.now()+5000;
    while(current()&&!inputRevoked&&!contents.isDestroyed()&&!contents.isCrashed()&&!foreign&&(!navigations||contents.isLoading())&&performance.now()<deadline)
      await new Promise(resolve=>setTimeout(resolve,25));
    if(inputRevoked)return {ok:false,reason:'user-input'};
    if(!current()||contents.isDestroyed()||contents.isCrashed())return {ok:false,reason:'task-changed'};
    if(foreign||!allowed(contents.getURL()))return {ok:false,reason:'navigation-scope'};
    if(!navigations||contents.isLoading())return {ok:false,reason:'navigation-timeout'};
    if(proposal.op==='NAVIGATE'&&contents.getURL()!==new URL(proposal.value).href)return {ok:false,reason:'navigation-destination'};
    // The next workflow step must obtain a new controller/snapshot and approval.
    // Never forward old text, matches, points, approval tokens, or permissions.
    return {ok:true,reason:'navigation-dispatched'};
  } finally {contents.removeListener('did-start-navigation',observe);contents.removeListener('before-input-event',keyboard);contents.removeListener('before-mouse-event',mouse);}
}
