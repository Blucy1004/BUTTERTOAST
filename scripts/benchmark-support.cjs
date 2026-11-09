const fs=require('node:fs');
const fixture='<!doctype html><html><head><meta charset="utf-8"><style>body{font:16px sans-serif;padding:16px}button{padding:12px}section{padding:6px}</style><title>ButterToast local benchmark</title></head><body><button id="action" onclick="window.count++;document.getElementById(\'count\').textContent=String(window.count)">Benchmark action</button><p id="count">0</p>'+Array.from({length:120},(_,i)=>`<section><h2>Item ${i}</h2><p>${'Deterministic local content. '.repeat(8)}</p></section>`).join('')+'<script>window.count=0</script></body></html>';
const median=a=>[...a].sort((a,b)=>a-b)[Math.floor(a.length/2)],summary=a=>({samples:a.length,medianMs:median(a),p95Ms:[...a].sort((a,b)=>a-b)[Math.min(a.length-1,Math.ceil(a.length*.95)-1)]});
function treeMetrics(root=process.pid){
 if(process.platform!=='linux')return null;
 const rows=[];for(const name of fs.readdirSync('/proc')){if(!/^\d+$/.test(name))continue;try{const text=fs.readFileSync(`/proc/${name}/stat`,'utf8'),fields=text.slice(text.lastIndexOf(')')+2).split(' ');rows.push({pid:Number(name),parent:Number(fields[1]),ticks:Number(fields[11])+Number(fields[12]),rssBytes:Number(fields[21])*4096});}catch{}}
 const ids=new Set([root]);let changed=true;while(changed){changed=false;for(const row of rows)if(ids.has(row.parent)&&!ids.has(row.pid)){ids.add(row.pid);changed=true;}}
 const own=rows.filter(r=>ids.has(r.pid));let pssKiB=0,privateKiB=0,pssProcesses=0;
 for(const row of own){try{const report=fs.readFileSync(`/proc/${row.pid}/smaps_rollup`,'utf8');const pss=report.match(/^Pss:\s+(\d+) kB$/m);if(!pss)continue;pssKiB+=Number(pss[1]);for(const match of report.matchAll(/^Private_(?:Clean|Dirty|Hugetlb):\s+(\d+) kB$/gm))privateKiB+=Number(match[1]);pssProcesses++;}catch{}}
 return {processes:own.length,rssMiB:own.reduce((n,r)=>n+r.rssBytes,0)/1048576,pssMiB:pssProcesses===own.length?pssKiB/1024:null,privateMiB:pssProcesses===own.length?privateKiB/1024:null,pssProcesses,cpuTicks:own.reduce((n,r)=>n+r.ticks,0)};
}
const wait=ms=>new Promise(r=>setTimeout(r,ms));
async function measuredIdle(root=process.pid){await wait(300);const before=treeMetrics(root),start=performance.now();await wait(1000);const after=treeMetrics(root),ms=performance.now()-start;return {...after,idleCpuPercent:before&&after?Math.max(0,(after.cpuTicks-before.cpuTicks)/100/(ms/1000)*100):null,intervalMs:ms};}
module.exports={fixture,summary,treeMetrics,measuredIdle,wait};
