import { readFileSync,writeFileSync } from 'node:fs';
import { join,resolve,relative } from 'node:path';
import { createHash } from 'node:crypto';
const root=resolve(import.meta.dirname,'../../..');
const [beforeArg,afterArg]=process.argv.slice(2);
if(!beforeArg||!afterArg)throw Error('Usage: summarize.mjs BEFORE_RUN AFTER_RUN');
const read=p=>JSON.parse(readFileSync(p,'utf8'));
const input=arg=>{const path=resolve(root,arg);const command=read(join(path,'command.json'));
  if(command.exitCode!==0||command.signal)throw Error('Only completed exit-0 measurements are comparable');
  const sample=read(join(path,'samples/read-paths.json'));
  if(sample.nonModelQueryMs.length!==30||sample.sseReconnectToFirstEventMs.length!==10||sample.sseExclusiveCursor!==1||sample.sseFirstNewSequence!==2)
    throw Error('Expected 30 queries and 10 exclusive-cursor-1 SSE resumes');
  return {path,command,sample};};
const before=input(beforeArg),after=input(afterArg);
if(JSON.stringify(before.command.hardware)!==JSON.stringify(after.command.hardware))throw Error('Hardware mismatch');
const stats=samples=>{if(samples.some(n=>!Number.isFinite(n)||n<0))throw Error('Invalid sample');
  const sorted=[...samples].sort((a,b)=>a-b);return {n:sorted.length,p50Ms:sorted[Math.ceil(sorted.length*.50)-1],p95Ms:sorted[Math.ceil(sorted.length*.95)-1],maxMs:sorted.at(-1)};};
const sha=p=>createHash('sha256').update(readFileSync(p)).digest('hex');
const output={task:'D22-A',statistic:'nearest-rank, no outlier removal',hardware:after.command.hardware,
  model:'deterministic-mock-slow-capacity-fixture; not real model performance',
  before:{run:relative(root,before.path).replaceAll('\\','/'),productionBaseline:before.command.productionBaseline,head:before.command.head,
    query:stats(before.sample.nonModelQueryMs),sse:stats(before.sample.sseReconnectToFirstEventMs),queueResidenceMs:before.sample.queueResidenceMsAtClaim},
  after:{run:relative(root,after.path).replaceAll('\\','/'),head:after.command.head,
    query:stats(after.sample.nonModelQueryMs),sse:stats(after.sample.sseReconnectToFirstEventMs),queueResidenceMs:after.sample.queueResidenceMsAtClaim},
  limits:read(join(after.path,'samples/limits.json')),concurrentAdmissions:read(join(after.path,'samples/concurrent-admission.json')),
  defaultCalibration:read(join(after.path,'samples/default-calibration.json')),
  conclusions:['No measured read-path bottleneck justifies a throughput optimization.','Latency differences are descriptive, not a causal speedup claim.',
    'Default queue/user/application limits are locally calibrated; real provider and D22-B deployment integration are pending.'],
  inputs:Object.fromEntries([before,after].flatMap(x=>['command.json','samples/read-paths.json'].map(p=>{const full=join(x.path,p);return [relative(root,full).replaceAll('\\','/'),sha(full)];})))};
writeFileSync(join(import.meta.dirname,'summary.json'),JSON.stringify(output,null,2)+'\n');
console.log(JSON.stringify({before:output.before,after:output.after}));
