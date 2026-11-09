const {spawnSync}=require('node:child_process');
const flags=process.platform==='linux'?['--ozone-platform=headless','--disable-gpu']:[];
const result=spawnSync(require('electron'),[...flags,'test/media-upload-smoke.cjs'],{stdio:'inherit',timeout:30000});process.exit(result.status??1);
