// Run once per new protected directory. REAL requires the explicit human authorization marker.
import {spawnSync} from 'node:child_process';
import {mkdirSync, openSync, closeSync, readFileSync, writeFileSync, existsSync, chmodSync} from 'node:fs';
import {resolve, join, isAbsolute} from 'node:path';
import os from 'node:os';
import {createHash} from 'node:crypto';
import {budget, reservationRmb, publicReport, qualifies} from './capacity-report.mjs';
const mode=process.argv[2], rawRoot=process.env.CODELESS_CAPACITY_PRIVATE_ROOT;
if(!['REAL','MOCK'].includes(mode))throw Error('Explicit REAL or MOCK required');
if(!rawRoot || !isAbsolute(rawRoot) || /[/\\](?:tests|contracts|docs)(?:[/\\]|$)/.test(rawRoot))throw Error('Absolute protected evidence root required, outside public artifacts');
if(mode==='REAL' && (process.env.CODELESS_CAPACITY_APPROVAL!=='USER_APPROVED_RMB_2' || !process.env.CODELESS_MODEL_API_KEY || process.env.CODELESS_MODEL_NAME!=='deepseek-flash'))throw Error('REAL authorization/configuration unavailable');
if(reservationRmb(budget.maxInputTokenReservation,budget.maxOutputTokens)*budget.maxAttempts>=budget.authorizedRmb)throw Error('Worst-case batch exceeds authorization');
const root=resolve(import.meta.dirname,'../../..'), out=resolve(rawRoot);
mkdirSync(out,{recursive:true,mode:0o700});if(process.platform!=='win32')chmodSync(out,0o700);
const lock=openSync(join(out,'invocation.lock'),'wx',0o600);closeSync(lock);
const env={...process.env,CODELESS_CAPACITY_MODE:mode,CODELESS_CAPACITY_PRIVATE_ROOT:out,CODELESS_MODEL_PROVIDER:mode==='REAL'?'deepseek':'deterministic-mock'};
if(mode==='MOCK'){delete env.CODELESS_MODEL_API_KEY;delete env.CODELESS_MODEL_NAME;delete env.CODELESS_CAPACITY_APPROVAL;}
env.NO_PROXY=[env.NO_PROXY,'localhost','127.0.0.1','::1'].filter(Boolean).join(',');env.no_proxy=env.NO_PROXY;
let group = null;
if(env.CODELESS_CAPACITY_RESOURCE_GROUP==='CPU1_MEMORY1536M') {
  const path=readFileSync('/proc/self/cgroup','utf8').trim().split(':').at(-1);
  const base='/sys/fs/cgroup'+path;
  const memoryMax=Number(readFileSync(base+'/memory.max','utf8').trim());
  const [quota,period]=readFileSync(base+'/cpu.max','utf8').trim().split(' ').map(Number);
  const swapMax=Number(readFileSync(base+'/memory.swap.max','utf8').trim());
  if(memoryMax!==1610612736 || quota/period!==1 || swapMax!==0)throw Error('Measured candidate process group differs from intended resource limits');
  group={cpuQuota:quota/period,memoryMaxBytes:memoryMax,memorySwapMaxBytes:swapMax,source:'actual cgroup v2 files'};
}
const win=process.platform==='win32', executable=win?(env.ComSpec??'cmd.exe'):'./services/api/mvnw';
const args=[...(win?['/d','/c','services\\api\\mvnw.cmd']:[]),'-f','services/api/pom.xml','-Dtest=RealModelCapacityIT',...(env.CODELESS_CAPACITY_MAVEN_REPO?['-Dmaven.repo.local='+env.CODELESS_CAPACITY_MAVEN_REPO]:[]),env.CODELESS_CAPACITY_PRECOMPILED==='1'?'surefire:test':'test'];
const log=join(out,'command.log'), fd=openSync(log,'wx',0o600), startedAt=new Date().toISOString();
const run=spawnSync(executable,args,{cwd:root,env,windowsHide:true,stdio:['ignore',fd,fd],timeout:8*60*1000});closeSync(fd);
const command={mode,command:[executable,...args],startedAt,completedAt:new Date().toISOString(),exitCode:run.status,signal:run.signal,errorClass:run.error?.code??null,logSha256:createHash('sha256').update(readFileSync(log)).digest('hex')};
writeFileSync(join(out,'command.json'),JSON.stringify(command,null,2)+'\n',{flag:'wx',mode:0o600});
const machine={cpu:os.cpus()[0]?.model,logicalCpus:os.cpus().length,memoryBytes:os.totalmem(),kernel:os.release(),node:process.version,
  processGroup:group,postgres:{cpuQuota:.5,memoryMaxBytes:402653184,memorySwapMaxBytes:402653184}};
let qualified=false;
if(existsSync(join(out,'raw-report.json'))) {
  const result=publicReport(JSON.parse(readFileSync(join(out,'raw-report.json'),'utf8')),command,machine), text=JSON.stringify(result,null,2)+'\n';
  if(process.env.CODELESS_MODEL_API_KEY && text.includes(process.env.CODELESS_MODEL_API_KEY))throw Error('Secret detected in derived report; publication blocked');
  writeFileSync(join(out,'anonymous-report.json'),text,{flag:'wx',mode:0o600});
  qualified=qualifies(result,command);
  console.log(JSON.stringify({mode,status:result.status,nativeExit:run.status,providerAttempts:result.provider.attempted,paidRequestUpperBound:mode==='REAL'?result.provider.dispatched:0,reservedUpperRmb:result.financial.reservedUpperRmb}));
}else console.log(JSON.stringify({mode,status:'FAILED',nativeExit:run.status,report:'MISSING'}));
process.exit(run.status===0&&!run.signal&&qualified?0:1);
