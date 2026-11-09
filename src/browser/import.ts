import {restorableUrl} from './session-store';
import {parseSettings,Settings} from './library';
import {record,exactKeys} from '../security/ipc';
export type ImportKind='bookmarks'|'history'|'settings';
export type ImportedEntry={url:string;title:string;time:number};
export type ImportResult={kind:ImportKind;entries:ImportedEntry[];settings:Settings|null;skipped:number};
const entities=(s:string)=>s.replace(/&(#(?:x[\da-f]+|\d+)|amp|quot|apos|lt|gt);/gi,(whole,key:string)=>{if(key[0]==='#'){const n=key[1].toLowerCase()==='x'?parseInt(key.slice(2),16):Number(key.slice(1));return n>0&&n<=0x10ffff&&!(n>=0xd800&&n<=0xdfff)?String.fromCodePoint(n):'';}return ({amp:'&',quot:'"',apos:"'",lt:'<',gt:'>'} as Record<string,string>)[key.toLowerCase()]??whole;});
const clean=(text:string)=>entities(text.replace(/<[^>]{0,4096}>/g,'')).replace(/[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/g,' ').trim().slice(0,200);
/** Strict, bounded import of exported data. HTML is scanned as text; it is never rendered or fetched. */
export function parseImport(kind:ImportKind,text:string):ImportResult {
  if(Buffer.byteLength(text)>2*1024*1024)throw new Error('Import too large');
  const entries:ImportedEntry[]=[],seen=new Set<string>();let skipped=0;
  const add=(url:unknown,title:unknown,time:unknown)=>{
    if(typeof url!=='string'||!url||!restorableUrl(url)||seen.has(url)||entries.length>=(kind==='bookmarks'?1000:3000)){skipped++;return;}
    seen.add(url);entries.push({url,title:typeof title==='string'?clean(title):new URL(url).hostname,time:typeof time==='number'&&Number.isSafeInteger(time)&&time>=0&&time<=Date.now()+86400000?time:0});
  };
  if(kind==='bookmarks'){
    if(!/^\s*<!DOCTYPE NETSCAPE-Bookmark-file-1>/i.test(text))throw new Error('Expected Chrome bookmark HTML export');
    const pattern=/<A\b([^>]{0,16384})>([\s\S]{0,8192}?)<\/A\s*>/gi;
    let match:RegExpExecArray|null;
    while((match=pattern.exec(text))){const href=/(?:^|\s)HREF\s*=\s*(?:"([^"<>]*)"|'([^'<>]*)')/i.exec(match[1]);const date=/(?:^|\s)ADD_DATE\s*=\s*"(\d{1,12})"/i.exec(match[1]);add(href?entities(href[1]??href[2]):null,match[2],date?Number(date[1])*1000:0);}
  }else{
    const data:unknown=JSON.parse(text);
    if(kind==='settings'){
      if(!record(data)||!exactKeys(data,['schema','settings'])||data.schema!=='buttertoast-settings/1')throw new Error('Unknown settings export');
      const settings=parseSettings(data.settings);if(!settings)throw new Error('Invalid settings');return {kind,entries,skipped,settings};
    }
    if(!record(data)||!Array.isArray(data['Browser History'])||data['Browser History'].length>20000)throw new Error('Expected Google Takeout BrowserHistory JSON');
    for(const entry of data['Browser History']){if(!record(entry)){skipped++;continue;}const raw=entry.time_usec;const time=typeof raw==='string'&&/^\d{1,18}$/.test(raw)?Number(raw):raw;add(entry.url,entry.title,typeof time==='number'?Math.floor(time/1000):0);}
    entries.sort((a,b)=>b.time-a.time);
  }
  return {kind,entries,settings:null,skipped};
}
export function exportBookmarks(entries:ImportedEntry[]):string {
  const esc=(text:string)=>text.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
  return '<!DOCTYPE NETSCAPE-Bookmark-file-1>\n<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">\n<TITLE>ButterToast bookmarks</TITLE>\n<DL><p>\n'+entries.slice(0,1000).filter(e=>e.url&&restorableUrl(e.url)).map(e=>`<DT><A HREF="${esc(e.url)}" ADD_DATE="${Math.floor(e.time/1000)}">${esc(e.title)}</A>`).join('\n')+'\n</DL><p>\n';
}
