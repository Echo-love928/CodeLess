import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync, readdirSync, copyFileSync, existsSync, statSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';
const mode=process.argv[2];
const tests={before:'ApiCapacityMeasurementTest#measureReadPathsAndQueue',acceptance:'ApiCapacityMeasurementTest,DefaultCapacityCalibrationTest,CapacityPolicyTest,BoundedModelProviderTest,TaskTimingTest',regression:'TaskQueueIntegrationTest,TaskHttpTest,TaskSseHttpTest,EditLifecycleIntegrationTest,ConcurrencyConsistencyTest,PlanModelIntegrationTest,ProcessRestartRecoveryTest'};
if(!Object.hasOwn(tests,mode)&&!['static','api','runner','e2e'].includes(mode)) throw Error('Unknown mode');
const root=resolve(import.meta.dirname,'../../..');
const run=join(root,'tests/performance/api/evidence',new Date().toISOString().replaceAll(':','-')+'-'+mode);
mkdirSync(run,{recursive:true});
const env={...process.env,CODELESS_MODEL_PROVIDER:'deterministic-mock',CODELESS_API_PERF_EVIDENCE:join(run,'samples')};
env.NO_PROXY=[env.NO_PROXY,'127.0.0.1','localhost','::1'].filter(Boolean).join(',');
env.no_proxy=env.NO_PROXY;
for(const key of ['CODELESS_MODEL_API_KEY','CODELESS_MODEL_NAME','CODELESS_PLAYWRIGHT_CHANNEL']) delete env[key];
const win=process.platform==='win32';
const args=tests[mode]?['-f','services/api/pom.xml',`-Dtest=${tests[mode]}`,'test']:['pnpm','run',`verify:${mode}`];
const command=win?(env.ComSpec??'cmd.exe'):(tests[mode]?'./services/api/mvnw':'corepack');
const actual=win?['/d','/c',...(tests[mode]?['services\\api\\mvnw.cmd']:['corepack']),...args]:args;
const git=(...a)=>{const r=spawnSync('git',['-c',`safe.directory=${root.replaceAll('\\','/')}`,...a],{cwd:root,encoding:'utf8'});if(r.status!==0)throw Error(r.stderr);return r.stdout.trim();};
const baselineFiles=['data/PlatformRepository.java','model/ModelConfiguration.java','tasks/TaskScheduler.java','tasks/TaskQueueService.java','agent/AgentLoop.java','error/GlobalExceptionHandler.java'].map(p=>'services/api/src/main/java/dev/codeless/api/'+p).concat('services/api/src/main/resources/application.yml');
const baselineOriginals=new Map();
if(mode==='before') {
  // Same harness on the recorded base production code. Preserve exact working bytes in finally, including on failure.
  for(const p of baselineFiles) {
    baselineOriginals.set(p,readFileSync(join(root,p)));
    const result=spawnSync('git',['-c',`safe.directory=${root.replaceAll('\\','/')}`,'show',`342b8b0:${p}`],{cwd:root});
    if(result.status!==0) throw Error('Cannot load base '+p);
    writeFileSync(join(root,p),result.stdout);
  }
}
const hash=p=>createHash('sha256').update(readFileSync(p)).digest('hex');
const files=git('ls-files','--cached','--others','--exclude-standard','--','services/api/src','tests/performance/api').split(/\r?\n/).filter(p=>p&&!p.includes('/evidence/')&&existsSync(join(root,p)));
const meta={mode,command:[command,...actual],head:git('rev-parse','HEAD'),branch:git('branch','--show-current'),startedAt:new Date().toISOString(),node:process.version,platform:process.platform,arch:process.arch,
  loopbackProxyBypass:true,
  sourceDigests:Object.fromEntries(files.map(p=>[p,hash(join(root,p))])),modelProvider:'deterministic-mock',exitCode:null,signal:null};
const {default:os}=await import('node:os');
meta.hardware={cpu:os.cpus()[0]?.model,logicalCpus:os.cpus().length,totalMemoryBytes:os.totalmem(),osRelease:os.release()};
const {openSync,closeSync}=await import('node:fs');
const fd=openSync(join(run,'command.log'),'w');
console.log('Evidence:',run);
const child=spawn(command,actual,{cwd:root,env,stdio:['ignore',fd,fd]});
const result=await new Promise(resolve=>{child.on('error',error=>resolve({code:null,signal:null,error:error.message}));child.on('exit',(code,signal)=>resolve({code,signal}));});
for(const [p,bytes] of baselineOriginals) writeFileSync(join(root,p),bytes);
closeSync(fd); meta.exitCode=result.code;meta.signal=result.signal;meta.error=result.error??null;meta.finishedAt=new Date().toISOString();meta.logSha256=hash(join(run,'command.log'));
if(tests[mode]||mode==='api') {
  const report=join(root,'services/api/target/surefire-reports');
  if(existsSync(report)) for(const file of readdirSync(report).filter(f=>f.endsWith('.xml')&&statSync(join(report,f)).mtimeMs>=Date.parse(meta.startedAt))) {
    mkdirSync(join(run,'junit'),{recursive:true});copyFileSync(join(report,file),join(run,'junit',file));
  }
}
writeFileSync(join(run,'command.json'),JSON.stringify(meta,null,2)+'\n');
console.log(JSON.stringify({exitCode:meta.exitCode,signal:meta.signal,evidence:run}));
process.exit(result.code===0&&!result.signal?0:1);
