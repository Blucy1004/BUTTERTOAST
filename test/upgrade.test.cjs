const test=require('node:test'),assert=require('node:assert/strict');
const {parseSession}=require('../dist/browser/session-store');
const {parseCommand}=require('../dist/security/ipc');
const {parseAiCommand}=require('../dist/ai/protocol');
const {safeDownloadName,executableName,safeDownloadChain,downloadZone}=require('../dist/browser/download-policy');
const {assetForRequest,UI_CSP}=require('../dist/security/ui-protocol');
test('tab settings survive versioned snapshots while legacy data and invalid authority remain distinct',()=>{
 const old={version:1,active:0,tabs:['https://example.test/']};assert.deepEqual(parseSession(old),old);
 const current={version:2,active:0,tabs:[{url:'https://example.test/',pinned:true,muted:true}]};
 const copy=parseSession(current);copy.tabs[0].pinned=false;assert.equal(current.tabs[0].pinned,true);
 for(const entry of [{url:'file:///secret',pinned:false,muted:false},{url:'https://example.test/',pinned:'yes',muted:false},{...current.tabs[0],cookie:'secret'},null])assert.equal(parseSession({...current,tabs:[entry]}),null);
 assert.equal(parseSession({...current,tabs:Array(1)}),null);
});
test('find, zoom and emergency commands cannot select foreign contents, submit code or smuggle approval',()=>{
 for(const command of [{type:'find',text:'hello',forward:true,next:false},{type:'zoom',direction:1},{type:'ai-stop-all'},{type:'tab-menu',id:1}]){assert.ok(parseCommand(command));assert.equal(parseCommand({...command,webContentsId:88}),null);assert.equal(parseCommand({...command,approved:true}),null);}
 for(const command of [{type:'find',text:'x'.repeat(257),forward:true,next:false},{type:'find',text:'line\nfeed',forward:true,next:false},{type:'zoom',direction:Infinity},{type:'zoom',direction:100},{type:'tab-menu',id:0}])assert.equal(parseCommand(command),null);
 assert.ok(parseAiCommand({type:'task-recover'}));assert.equal(parseAiCommand({type:'task-recover',url:'https://other.test'}),null);
});
test('download names retain dangerous suffixes, strip visual spoofing and reject Windows device aliases',()=>{
 for(const value of ['COM¹.txt','LPT².txt','CONIN$','conout$.log'])assert.equal(safeDownloadName(value),'download.bin');
 const long=safeDownloadName('invoice'.repeat(50)+'.exe');assert.ok(long.length<=160);assert.ok(long.endsWith('.exe'));assert.equal(executableName(long),true);
 for(const value of ['report.pdf\u202e.exe','report\u200b.txt','a\u2060b.txt'])assert.doesNotMatch(safeDownloadName(value),/[\u202e\u200b\u2060]/);
 for(const value of ['powershell.psm1','disk.iso','link.scf','help.chm','sheet.xlsm','app.exe. '])assert.equal(executableName(value),true);
 assert.equal(executableName('notes.txt'),false);
});
test('download Internet-zone metadata contains no tokens or metadata line injection',()=>{
 assert.equal(downloadZone('https://download.test'),'[ZoneTransfer]\r\nZoneId=3\r\nHostUrl=https://download.test/\r\n');
 for(const origin of ['https://download.test/?token=secret','https://u:p@download.test','https://download.test\r\nZoneId=0','file:///tmp'])assert.throws(()=>downloadZone(origin));
 assert.equal(safeDownloadChain(['https://download.test/\nsecret']),false);assert.equal(safeDownloadChain(['https://download.test/\\secret']),false);
});
test('bundled font has one fixed UI route and never broadens external request permissions',()=>{
 assert.deepEqual(assetForRequest('toast-ui://app/fonts/PretendardVariable.woff2','GET'),{name:'fonts/PretendardVariable.woff2',type:'font/woff2'});
 for(const url of ['toast-ui://app/fonts/other.woff2','toast-ui://app/fonts/PretendardVariable.woff2?remote=1','https://fonts.test/font.woff2'])assert.equal(assetForRequest(url,'GET'),null);
 assert.match(UI_CSP,/font-src 'self'/);assert.match(UI_CSP,/connect-src 'none'/);
});
