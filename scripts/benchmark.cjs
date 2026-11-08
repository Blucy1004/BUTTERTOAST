const {spawnSync}=require('node:child_process');
const flags=process.platform==='linux'?['--ozone-platform=headless','--disable-gpu']:[];
const result=spawnSync(require('electron'),[...flags,'test/local-benchmark.cjs'],{stdio:'inherit',timeout:75000});process.exit(result.status??1);
