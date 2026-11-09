const {app,BrowserWindow}=require('electron'),fs=require('node:fs');
const {until}=require('./long-common.cjs');
if(app.isPackaged||!process.env.BT_TORTURE_PROFILE||!process.env.BT_TORTURE_OUTPUT)throw Error('Test profile/output required');
app.setPath('userData',process.env.BT_TORTURE_PROFILE);require('../../dist/main');
app.whenReady().then(async()=>{const win=BrowserWindow.getAllWindows()[0];await until(async()=>!win.webContents.isLoading()&&await win.webContents.executeJavaScript('!document.getElementById("new").disabled'),'UI ready');fs.writeFileSync(process.env.BT_TORTURE_OUTPUT,JSON.stringify({ready:true,versions:process.versions}));win.destroy();app.exit(0)}).catch(e=>{console.error(e);app.exit(1)});
