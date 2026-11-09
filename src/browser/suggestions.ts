import type {Entry} from './library';
import {restorableUrl} from './session-store';
export type Suggestion={url:string;title:string;source:'bookmark'|'history'};
/** Local metadata only. Queries are neither persisted nor sent to a search provider. */
export function addressSuggestions(query:string,bookmarks:Entry[],history:Entry[]):Suggestion[] {
  if(typeof query!=='string'||query.length>256||/[\u0000-\u001f\u007f]/.test(query))return [];
  const words=query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);if(!words.length)return [];
  const seen=new Set<string>(),matches:{item:Suggestion;score:number;time:number}[]=[];
  for(const [source,entries] of [['bookmark',bookmarks],['history',history]] as const){
    for(const entry of entries.slice(0,source==='bookmark'?1000:3000)){
      if(!entry.url||!restorableUrl(entry.url)||seen.has(entry.url))continue;
      const searchable=`${entry.title} ${entry.url}`.toLocaleLowerCase();if(!words.every(w=>searchable.includes(w)))continue;
      seen.add(entry.url);const prefix=entry.url.replace(/^https?:\/\/(?:www\.)?/,'').toLocaleLowerCase().startsWith(words.join(' '));
      matches.push({item:{url:entry.url,title:entry.title.slice(0,200),source},score:Number(prefix)*2+Number(source==='bookmark'),time:entry.time});
    }
  }
  return matches.sort((a,b)=>b.score-a.score||b.time-a.time).slice(0,8).map(x=>x.item);
}
