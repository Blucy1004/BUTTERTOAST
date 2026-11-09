import {randomUUID} from 'node:crypto';
import {resolveAddress} from '../policy';
import type {Entry, Settings} from './library';
import {addressSuggestions} from './suggestions';

type Target={kind:'tab';tab:number;window?:number}|{kind:'navigate';url:string}|{kind:'draft';text:string};
export type CommandResult={id:string;title:string;detail:string;kind:Target['kind']|'bookmark'|'history'};
/** Opaque, one-query capabilities. Renderers cannot supply execution URLs or stale selections. */
export class CommandBar {
  private targets=new Map<string,Target>();
  private expires=0;
  clear():void{this.targets.clear();this.expires=0;}
  search(query:string,tabs:{id:number;title:string;url:string;window?:number}[],bookmarks:Entry[],history:Entry[],engine:Settings['search'],now=Date.now()):CommandResult[]{
    this.clear();if(query.length>256||/[\u0000-\u001f\u007f]/.test(query))return [];
    const q=query.trim(),words=q.toLocaleLowerCase().split(/\s+/).filter(Boolean),items:CommandResult[]=[];
    const add=(target:Target,title:string,detail:string,kind:CommandResult['kind']=target.kind)=>{const id=randomUUID();this.targets.set(id,target);items.push({id,title:title.slice(0,200),detail:detail.slice(0,300),kind});};
    if(q.startsWith('/ai ')){add({kind:'draft',text:q.slice(4)},'Toast 작업 초안 만들기',q.slice(4));}
    else {
      for(const tab of tabs.filter(t=>words.every(w=>`${t.title} ${t.url}`.toLocaleLowerCase().includes(w))).slice(0,10))add({kind:'tab',tab:tab.id,...(tab.window?{window:tab.window}:{})},tab.title||'새 탭',tab.url||'열린 탭');
      for(const entry of addressSuggestions(q,bookmarks,history))add({kind:'navigate',url:entry.url},entry.title||entry.url,entry.url,entry.source);
      if(q){const url=resolveAddress(q,engine);if(url)add({kind:'navigate',url},'주소로 이동 · 검색',q);add({kind:'draft',text:q},'Toast 작업 초안 만들기',q);}
    }
    this.expires=now+120000;return items;
  }
  take(id:string,now=Date.now()):Target|null{const target=now<=this.expires?this.targets.get(id):undefined;this.clear();return target??null;}
}
