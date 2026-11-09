import { app, BrowserWindow, dialog, DownloadItem, Session, shell, WebContents } from 'electron';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { writeFile, lstat } from 'node:fs/promises';
import {DownloadStore} from './download-store';
import { safeDownloadName, safeDownloadChain, executableName, downloadZone } from './download-policy';
type Download = { id: string; name: string; origin: string; received: number; total: number; state: string; paused: boolean; protection:'pending'|'marked'|'unavailable'|'not-applicable'; path: string; item?: DownloadItem };
export class DownloadManager {
  private entries = new Map<string, Download>();
  private prompting = false;
  private lastPrompt = 0;
  private disposed = false;
  constructor(private parent: BrowserWindow, private active: () => WebContents | undefined, private changed: () => void,private store?:DownloadStore,private additionalActive?:(wc:WebContents)=>boolean) {}
  async load():Promise<void>{for(const saved of await this.store?.load()??[])this.entries.set(saved.id,{...saved,state:['completed','cancelled'].includes(saved.state)?saved.state:'interrupted-after-restart'});}
  storageStatus(){return this.store?.status??'unavailable';}
  private persist():void {this.store?.save([...this.entries.values()].map(({item,...entry})=>({...entry,paused:false})));}
  async flush():Promise<void>{this.persist();await this.store?.flush();}
  snapshot() { return [...this.entries.values()].reverse().map(({ item, path: _path, ...entry }) => entry); }
  /** Called synchronously from will-download so no bytes are written before a native destination decision. */
  accept = (event: Electron.Event, item: DownloadItem, wc: WebContents): void => {
    const chain = item.getURLChain();
    if (this.disposed || !wc || wc.isDestroyed() || wc.isCrashed() || wc !== this.active()&&!this.additionalActive?.(wc) || !safeDownloadChain(chain) || this.prompting || this.parent.isDestroyed()
      || Date.now() - this.lastPrompt < 1500 || [...this.entries.values()].filter(e => ['progressing', 'interrupted'].includes(e.state)).length >= 5) { event.preventDefault(); return; }
    this.prompting = true; this.lastPrompt = Date.now();
    const name = safeDownloadName(item.getFilename()), origin = new URL(item.getURL()).origin;
    const sourceUrl=wc.getURL(),frame=wc.mainFrame;let revoked=false;
    const navigation=(event:{isMainFrame:boolean})=>{if(event.isMainFrame)revoked=true;};
    const revoke=()=>{revoked=true;};
    wc.on('did-start-navigation',navigation);wc.on('destroyed',revoke);wc.on('render-process-gone',revoke);
    const valid=()=>!revoked&&!this.disposed&&!this.parent.isDestroyed()&&!wc.isDestroyed()&&!wc.isCrashed()&&(wc===this.active()||this.additionalActive?.(wc))&&wc.getURL()===sourceUrl&&wc.mainFrame===frame
      &&safeDownloadChain(item.getURLChain())&&JSON.stringify(item.getURLChain())===JSON.stringify(chain)&&item.getURL()===chain.at(-1);
    try {
      const response = dialog.showMessageBoxSync(this.parent, { type: 'warning', title: '파일 다운로드', message: `${name} 파일을 저장할까요?`,
        detail: `제공 사이트: ${origin}\n${executableName(name) ? '실행 가능한 파일입니다. 신뢰하는 출처인지 확인하세요.\n' : ''}다운로드 후 자동으로 열거나 실행하지 않습니다.`,
        buttons: ['취소', '저장 위치 선택'], defaultId: 0, cancelId: 0, noLink: true });
      if (response !== 1 || !valid()) { event.preventDefault(); return; }
      const destination = dialog.showSaveDialogSync(this.parent, { title: '다운로드 저장', defaultPath: path.join(app.getPath('downloads'), name), properties: ['showOverwriteConfirmation'] });
      if (!destination || !valid()) { event.preventDefault(); return; }
      if(executableName(path.basename(destination))&&!executableName(name)){
        const answer=dialog.showMessageBoxSync(this.parent,{type:'warning',title:'실행 가능한 형식으로 저장',message:'선택한 파일 이름은 실행 코드나 스크립트를 포함할 수 있는 형식입니다.',detail:path.basename(destination),buttons:['취소','저장'],defaultId:0,cancelId:0,noLink:true});
        if(answer!==1||!valid()){event.preventDefault();return;}
      }
      item.setSavePath(destination);
      while (this.entries.size >= 100) {
        const old = [...this.entries.values()].find(e => !['progressing', 'interrupted'].includes(e.state));
        if (!old) { event.preventDefault(); return; } this.entries.delete(old.id);
      }
      const entry: Download = { id: randomUUID(), name:path.basename(destination), origin, received: 0, total: item.getTotalBytes(), state: 'progressing', paused: false, protection:process.platform==='win32'?'pending':'not-applicable', path: destination, item };
      this.entries.set(entry.id, entry);this.persist();
      item.on('updated', (_e, state) => { entry.state = state; entry.received = item.getReceivedBytes(); entry.total = item.getTotalBytes(); entry.paused = item.isPaused(); this.changed(); });
      item.once('done', (_e, state) => { entry.state = state==='completed'?'verifying':state;entry.paused=false;
        if(state==='completed')void this.completed(entry);else {this.persist();this.changed();}
      }); this.changed();
    } catch { event.preventDefault(); } finally { this.prompting = false;wc.removeListener('did-start-navigation',navigation);wc.removeListener('destroyed',revoke);wc.removeListener('render-process-gone',revoke); }
  };
  private async completed(entry:Download):Promise<void> {
    if(process.platform==='win32'){
      try {const stat=await lstat(entry.path);if(!stat.isFile()||stat.isSymbolicLink())throw Error('Unexpected file');await writeFile(`${entry.path}:Zone.Identifier`,downloadZone(entry.origin),'utf8');entry.protection='marked';}
      catch {entry.protection='unavailable';}
    }
    entry.state='completed';this.persist();if(!this.disposed)this.changed();
  }
  action(id: string, action: 'pause' | 'resume' | 'cancel' | 'show' | 'remove'): void {
    const entry = this.entries.get(id); if (!entry) return;
    try {
      if (action === 'show' && entry.state === 'completed') shell.showItemInFolder(entry.path);
      if (action === 'remove' && !['progressing', 'interrupted'].includes(entry.state)) this.entries.delete(id);
      if (['progressing', 'interrupted'].includes(entry.state)) {
        if (action === 'cancel') entry.item?.cancel();
        if (action === 'pause') entry.item?.pause();
        if (action === 'resume' && entry.item?.canResume()) entry.item?.resume();
      }
      this.persist();this.changed();
    } catch { /* Completed native items no longer expose live methods. */ }
  }
  cancelAll():void {for (const e of this.entries.values()) if (['progressing', 'interrupted'].includes(e.state)) { try { e.item?.cancel(); } catch {} }}
  dispose(): void {this.disposed=true;this.cancelAll();}
}
