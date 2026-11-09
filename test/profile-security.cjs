// Real app windows and IPC; all authentication responses belong to local fixtures.
const {app,BrowserWindow,webContents,session,nativeTheme}=require('electron');
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {defaultProfile,defaultAppearance,PROFILE_KEY}=require('../dist/profile/model');
app.setPath('userData',fs.mkdtempSync(path.join(os.tmpdir(),'bt-profile-e2e-')));
process.env.BUTTERTOAST_SUPABASE_URL='https://abcdefghijklmnopqrst.supabase.co';
process.env.BUTTERTOAST_SUPABASE_PUBLISHABLE_KEY='sb_publishable_local_test_fixture_1234';
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(fn,label){for(let i=0;i<400;i++){if(await fn())return;await wait(20)}throw Error(label)}
async function capture(window,name,width,height){
 // A background child window may not have a composited surface yet on Windows.
 window.setContentSize(width,height);window.show();window.focus();
 const wc=window.webContents;
 await wc.executeJavaScript('document.fonts.ready.then(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))))');
 for(let attempt=0;attempt<5;attempt++){
   try {
     const picture=await wc.capturePage(undefined,{stayAwake:true});
     assert.equal(picture.isEmpty(),false,'Expected a rendered screenshot');
     fs.writeFileSync(`artifacts/${name}.png`,picture.toPNG());return;
   } catch(error) {
     if(error.message!=='UnknownVizError'||attempt===4)throw error;
     console.log(`Waiting for compositor: ${name}, attempt ${attempt+1}`);await wait(150);
   }
 }
}
const deadline=setTimeout(()=>{console.error('FAIL profile timeout');app.exit(1)},110000);
let groups=0;const pass=label=>{groups++;console.log('PASS',label)};
require('../dist/main');
app.whenReady().then(async()=>{
 const main=BrowserWindow.getAllWindows()[0],ui=main.webContents;main.setContentSize(1440,900);
 await until(async()=>!ui.isLoading()&&await ui.executeJavaScript('!document.getElementById("account-open").disabled'),'main ready');
 await ui.executeJavaScript('window.states=[];browser.onState(s=>states.push(s));browser.command({type:"ready"})');
 await until(()=>ui.executeJavaScript('states.length>0'),'main state');
 const layout=await ui.executeJavaScript('states.at(-1).layout');
 const human=webContents.getAllWebContents().find(w=>w.session===session.fromPartition('persist:human'));
 human.session.protocol.handle('https',()=>new Response('<title>Profile privacy fixture</title><p>Ordinary web page</p>',{headers:{'Content-Type':'text/html'}}));
 const emailA='dawn@example.test',emailB='night@example.test';
 const ids={[emailA]:'11111111-1111-4111-8111-111111111111',[emailB]:'22222222-2222-4222-8222-222222222222'};
 const access={[emailA]:'fixture-profile-A-access-not-live',[emailB]:'fixture-profile-B-access-not-live'};
 const profiles=new Map([[emailA,{...defaultProfile(),name:'새벽 여행자',avatar:'sun'}],[emailB,{...defaultProfile(),name:'다른 계정',avatar:'moon'}]]);
 const user=email=>({id:ids[email],email,email_confirmed_at:'2026-11-08T00:00:00Z',user_metadata:{[PROFILE_KEY]:structuredClone(profiles.get(email)),external_role:'admin'}});
 const token=email=>({access_token:access[email],refresh_token:'fixture-refresh-not-live',token_type:'bearer',expires_in:3600,user:user(email)});
 const calls=[];let delayUpdate=false,releaseUpdate;
 const network=session.fromPartition('toast-auth-network');
 network.protocol.handle('https',async request=>{
   const url=new URL(request.url),body=['POST','PUT'].includes(request.method)?await request.json().catch(()=>null):null;
   calls.push({url:request.url,method:request.method,body,authorization:request.headers.get('authorization')});
   if(url.pathname==='/auth/v1/token')return body?.password==='fixture-password'&&profiles.has(body.email)?Response.json(token(body.email)):Response.json({error_code:'invalid_credentials'},{status:400});
   if(url.pathname==='/auth/v1/logout')return new Response(null,{status:204});
   const email=Object.keys(access).find(key=>`Bearer ${access[key]}`===request.headers.get('authorization'));
   if(!email)return Response.json({error_code:'invalid_credentials'},{status:401});
   if(request.method==='PUT'){
     assert.equal(url.pathname,'/auth/v1/user');assert.deepEqual(Object.keys(body),['data']);assert.deepEqual(Object.keys(body.data),[PROFILE_KEY]);
     profiles.set(email,structuredClone(body.data[PROFILE_KEY]));const response=user(email);
     if(delayUpdate){delayUpdate=false;return await new Promise(resolve=>{releaseUpdate=()=>resolve(Response.json(response))});}
     return Response.json(response);
   }
   return Response.json(user(email));
 });
 await ui.executeJavaScript('document.getElementById("theme-toggle").click()');
 await until(()=>ui.executeJavaScript('document.documentElement.dataset.theme==="light"'),'light theme');
 assert.match(await ui.executeJavaScript('getComputedStyle(document.body).backgroundImage'),/linear-gradient/);
 assert.deepEqual(await ui.executeJavaScript('states.at(-1).layout'),layout);assert.equal(calls.length,0);
 assert.equal(await ui.executeJavaScript('fetch("https://avatars.example.test/private.png").then(()=>true,()=>false)'),false);
 fs.mkdirSync('artifacts',{recursive:true});
 pass('guest light theme renders a local dawn sky without account traffic, external assets or geometry changes');

 await ui.executeJavaScript('browser.command({type:"account-open"});browser.command({type:"manager-open"});browser.command({type:"ai-toggle"})');
 const find=uri=>webContents.getAllWebContents().find(w=>w.getURL()===uri);
 await until(()=>find('toast-ui://app/account.html')&&!find('toast-ui://app/account.html').isLoading()&&find('toast-ui://app/manager.html')&&!find('toast-ui://app/manager.html').isLoading()&&find('toast-ui://app/ai.html')&&!find('toast-ui://app/ai.html').isLoading(),'all UI windows');
 const aw=find('toast-ui://app/account.html'),manager=find('toast-ui://app/manager.html'),ai=find('toast-ui://app/ai.html');
 await until(async()=>!(await aw.executeJavaScript('document.getElementById("submit").disabled')),'account state');
 for(const wc of [ui,aw,manager,ai])await until(()=>wc.executeJavaScript('document.documentElement.dataset.theme==="light"'),'theme reaches each trusted UI');
 await aw.executeJavaScript('window.states=[];account.onState(s=>states.push(s));account.command({type:"state"})');
 const state=()=>aw.executeJavaScript('states.at(-1)');
 const login=async email=>{await aw.executeJavaScript(`document.getElementById('mode-login').click();document.getElementById('email').value=${JSON.stringify(email)};document.getElementById('password').value='fixture-password';document.getElementById('submit').click()`);await until(async()=>(await state())?.status==='signed-in','profile login');if(!(await state()).syncEnabled){await aw.executeJavaScript('document.getElementById("profile-sync").click()');await until(async()=>(await state()).syncEnabled&&!(await state()).busy,'explicit profile sync');}};
 await login(emailA);await until(()=>ui.executeJavaScript('document.getElementById("account-name").textContent==="새벽 여행자"'),'account name in main');
 assert.equal((await state()).profile.name,'새벽 여행자');
 for(const wc of [ui,aw,manager,ai])await until(()=>wc.executeJavaScript('document.documentElement.dataset.theme==="dark"'),'account preferences replace guest theme');
 const json=await aw.executeJavaScript('JSON.stringify({states,local:{...localStorage},session:{...sessionStorage},html:document.body.innerHTML})');
 for(const secret of [...Object.values(access),'fixture-refresh-not-live','external_role'])assert.equal(json.includes(secret),false);
 pass('confirmed account profile replaces guest settings in every trusted window without exposing credentials or metadata roles');

 await aw.executeJavaScript(`document.getElementById('profile-name').value='새벽의 Butter';document.getElementById('profile-bio').value='하루를 여는 나만의 브라우저';document.querySelector('[data-avatar="cloud"]').click();document.getElementById('profile-name').dispatchEvent(new Event('input',{bubbles:true}));document.getElementById('appearance-tab').click();document.getElementById('appearance-theme').value='light';document.getElementById('appearance-accent').value='violet';document.getElementById('appearance-textSize').value='large';document.getElementById('appearance-density').value='compact';document.getElementById('appearance-corners').value='rounded';document.getElementById('appearance-motion').value='reduced';document.getElementById('appearance-theme').dispatchEvent(new Event('input',{bubbles:true}))`);
 assert.equal(await aw.executeJavaScript('document.getElementById("appearance-preview").dataset.theme'),'light');assert.equal(await ui.executeJavaScript('document.documentElement.dataset.theme'),'dark');
 await aw.executeJavaScript('document.getElementById("profile-save").click()');
 await until(async()=>(await state()).profile.name==='새벽의 Butter'&&!(await state()).busy,'profile saved');
 assert.equal(profiles.get(emailA).appearance.theme,'light');assert.equal(calls.at(-1).authorization,`Bearer ${access[emailA]}`);
 for(const wc of [ui,aw,manager,ai])await until(()=>wc.executeJavaScript('document.documentElement.dataset.theme==="light"&&document.documentElement.dataset.accent==="violet"'),'saved theme broadcast');
 assert.deepEqual(await ui.executeJavaScript('states.at(-1).layout'),layout);
 assert.equal(await aw.executeJavaScript('getComputedStyle(document.body).fontSize'),'16px');
 assert.equal(await aw.executeJavaScript('getComputedStyle(document.getElementById("profile-save")).borderRadius'),'12px');
 pass('profile form saves nickname, bio, avatar and seven appearance choices; preview is local until server acknowledgement');

 const accountWindow=BrowserWindow.fromWebContents(aw);
 await capture(accountWindow,'profile-appearance',760,1180);
 await aw.executeJavaScript('document.getElementById("profile-tab").click()');await capture(accountWindow,'profile-settings',760,860);
 await capture(main,'profile-light-workspace',1440,900);
 const revision=(await state()).profileRevision;await wait(1100);
 await aw.executeJavaScript(`document.getElementById('profile-name').value='저장하지 않은 초안';document.getElementById('profile-name').dispatchEvent(new Event('input',{bubbles:true}))`);
 await ui.executeJavaScript('document.getElementById("theme-toggle").click()');await until(async()=>(await state()).profileRevision!==revision,'other UI saves theme');
 assert.equal(await aw.executeJavaScript('document.getElementById("profile-name").value'),'저장하지 않은 초안');assert.equal(await aw.executeJavaScript('document.getElementById("profile-save").disabled'),true);
 const countBefore=calls.length;await aw.executeJavaScript(`account.command(${JSON.stringify({type:'profile-save',revision,profile:defaultProfile()})})`);await wait(60);assert.equal(calls.length,countBefore);
 await aw.executeJavaScript('document.getElementById("profile-reload").click()');await until(async()=>!(await state()).busy&&await aw.executeJavaScript('document.getElementById("profile-name").value==="새벽의 Butter"'),'reload current account');
 assert.equal(calls.at(-1).method,'GET');
 pass('unsaved edits survive concurrent theme changes; stale revisions are rejected and explicit reload gets current server data');

 await wait(1100);const current=await state();const beforeInvalid=calls.length;
 const invalid=[{type:'profile-save',revision:current.profileRevision,profile:defaultProfile(),userId:ids[emailB]},{type:'profile-save',revision:current.profileRevision,profile:{...defaultProfile(),avatar:'https://evil.test/photo'}},{type:'profile-save',revision:current.profileRevision,profile:{...defaultProfile(),appearance:{...defaultAppearance(),css:'body{display:none}'}}}];
 for(const command of invalid)await aw.executeJavaScript(`account.command(${JSON.stringify(command)})`);
 const {WEB_PREFERENCES}=require('../dist/security/electron');
 const forged=new BrowserWindow({show:false,webPreferences:{...WEB_PREFERENCES,session:aw.session,preload:path.join(__dirname,'fixtures/forged-profile-preload.cjs')}});
 await forged.loadURL('toast-ui://app/account.html');forged.webContents.send('profile-probe',{type:'profile-save',revision:current.profileRevision,profile:defaultProfile()});await wait(120);
 assert.equal(calls.length,beforeInvalid);assert.deepEqual(await forged.webContents.executeJavaScript('probe.read()'),[]);forged.destroy();
 await human.loadURL('https://profile.test/page');assert.deepEqual(await human.executeJavaScript('[typeof appearance,typeof account,typeof require]'),['undefined','undefined','undefined']);
 assert.equal(await human.executeJavaScript('fetch("toast-ui://app/profile.js").then(()=>true,()=>false)'),false);
 pass('foreign same-URL windows, web pages and injected identities, CSS or avatar URLs cannot read or modify profile settings');

 await aw.executeJavaScript(`document.getElementById('profile-name').value='<img src=x onerror=alert(1)>';document.getElementById('profile-name').dispatchEvent(new Event('input',{bubbles:true}));document.getElementById('profile-save').click()`);
 await until(async()=>(await state()).profile.name.startsWith('<img'),'literal name saved');
 assert.equal(await aw.executeJavaScript('document.getElementById("profile-title").children.length'),0);assert.equal(await ui.executeJavaScript('document.getElementById("account-name").children.length'),0);
 assert.equal(await ui.executeJavaScript('document.getElementById("account-name").textContent'),'<img src=x onerror=alert(1)>');
 pass('untrusted profile text stays literal in account and browser headers without HTML execution');

 await wait(1100);delayUpdate=true;
 await aw.executeJavaScript(`document.getElementById('profile-name').value='계정 A에만 저장';document.getElementById('profile-name').dispatchEvent(new Event('input',{bubbles:true}));document.getElementById('profile-save').click()`);await until(()=>!!releaseUpdate,'delayed profile update');
 await aw.executeJavaScript('for(let i=0;i<100;i++)account.command({type:"invalid"});account.command({type:"logout"})');
 await until(async()=>(await state()).status==='signed-out','logout while flooded');releaseUpdate();await wait(120);
 assert.equal((await state()).profile,null);assert.equal(await aw.executeJavaScript('document.getElementById("profile-name").value'),'');assert.equal(await aw.executeJavaScript('document.getElementById("profile-bio").value'),'');assert.equal(await aw.executeJavaScript('document.getElementById("email").value'),'');
 await until(()=>ui.executeJavaScript('document.getElementById("account-name").textContent==="로그인"&&document.documentElement.dataset.theme==="light"'),'guest appearance restored');
 pass('logout survives IPC flooding, clears editable account data, restores guest appearance and discards a late profile response');

 await wait(3300);await login(emailB);assert.equal((await state()).profile.name,'다른 계정');assert.equal((await state()).profile.appearance.theme,'dark');
 await until(()=>ui.executeJavaScript('document.getElementById("account-name").textContent==="다른 계정"&&document.documentElement.dataset.theme==="dark"'),'second account applied');
 await aw.executeJavaScript('document.getElementById("logout").click()');await until(async()=>(await state()).status==='signed-out','second account logout');await wait(3100);await login(emailA);
 assert.equal((await state()).profile.name,'계정 A에만 저장');assert.equal((await state()).profile.appearance.accent,'violet');
 pass('signing into a different account isolates profile settings and signing back restores only the original server profile');

 await aw.executeJavaScript('document.getElementById("appearance-tab").click();document.getElementById("appearance-theme").value="system";document.getElementById("appearance-theme").dispatchEvent(new Event("input",{bubbles:true}));document.getElementById("profile-save").click()');
 await until(async()=>(await state()).profile.appearance.theme==='system','system preference saved');
 for(const theme of ['light','dark']){nativeTheme.themeSource=theme;for(const wc of [ui,aw,manager,ai])await until(()=>wc.executeJavaScript(`document.documentElement.dataset.theme===${JSON.stringify(theme)}`),'live OS theme update');}
 main.setContentSize(640,700);await wait(150);assert.equal(await ui.executeJavaScript('document.documentElement.scrollWidth<=innerWidth'),true);
 pass('system mode follows native theme changes in all app views and custom text still fits the narrow browser layout');
 clearTimeout(deadline);console.log(`Profile security groups: ${groups} passed`);app.exit(0);
}).catch(error=>{console.error('FAIL',error);clearTimeout(deadline);app.exit(1)});
