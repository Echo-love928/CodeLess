// Read-only observation of native commands; no model credentials, retry, limit or CI changes.
import { spawn,spawnSync } from 'node:child_process';
import { readFileSync,writeFileSync,mkdirSync,openSync,closeSync,readdirSync,existsSync,statSync } from 'node:fs';
import { join,resolve,relative } from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { javaHome } from '../../../../scripts/eval/run-batch.mjs';
const root=resolve(fileURLToPath(new URL('../../../../',import.meta.url)));
const mode=process.argv[2],win=process.platform==='win32';
if(!['policy','runtime','affected','gate'].includes(mode))throw Error('usage: node tests/agent/repair/d25-quality/record.mjs policy|runtime|affected|gate');
const env={...process.env,JAVA_HOME:javaHome()};
for(const key of Object.keys(env))if(/API_KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL|^CODELESS_|^SPRING_|^JAVA_TOOL_OPTIONS$|^JDK_JAVA_OPTIONS$|^_JAVA_OPTIONS$|^MAVEN_OPTS$/i.test(key))delete env[key];
const pathKey=Object.keys(env).find(k=>k.toLowerCase()==='path')??'PATH';env[pathKey]=join(env.JAVA_HOME,'bin')+(win?';':':')+env[pathKey];
env.NO_PROXY=env.no_proxy='127.0.0.1,localhost,::1';
const n=Number(env.GIT_CONFIG_COUNT??0);Object.assign(env,{GIT_CONFIG_COUNT:String(n+1),['GIT_CONFIG_KEY_'+n]:'safe.directory',['GIT_CONFIG_VALUE_'+n]:root.replaceAll('\\','/')});
const git=(...args)=>{let r=spawnSync('git',args,{cwd:root,env,encoding:'utf8',windowsHide:true});if(r.status!==0)throw Error('git failed');return r.stdout.trim();};
const hash=b=>'sha256:'+createHash('sha256').update(b).digest('hex');
const startedAt=new Date().toISOString(),id=startedAt.replaceAll(':','-')+'-'+mode;
const publicDir=join(root,'tests/agent/repair/evidence/2026-10-30/d25-quality',id),privateDir=join(root,'.local-data/d25-quality',id);
mkdirSync(publicDir,{recursive:true});mkdirSync(privateDir,{recursive:true});
const paths=git('ls-files','--','services/api/src','services/api/pom.xml','services/runner/src','prompts','templates','tests/agent/repair/d25-quality','scripts','package.json','pnpm-lock.yaml','.github/workflows/ci.yml').split(/\r?\n/).filter(Boolean);
const sourceDigests=Object.fromEntries(paths.map(p=>[p,hash(readFileSync(join(root,p)))]));
const screenshots=new Map(mode==='gate'?git('ls-files','*.png').split(/\r?\n/).filter(Boolean).map(p=>[p,readFileSync(join(root,p))]):[]);
const head=git('rev-parse','HEAD'),dirty=git('status','--porcelain','--untracked-files=no');
const suite=mode==='policy'?'D25QualityPolicyTest':mode==='runtime'?'D25QualityRegressionTest':
 'D25QualityPolicyTest,D25ProposalFeedbackTest,AcceptanceActionsTest,RepairContextTest,RepairInputCompactionTest,RoundFiveContextTest,DeepSeekModelProviderTest';
const mvn=['-f','services/api/pom.xml','-Dtest='+suite,'test'];
const command=mode==='gate'?[process.execPath,'--import',new URL('./stage-observer.mjs',import.meta.url).href,'scripts/ci-gate.mjs']:
 win?[env.ComSpec??'cmd.exe','/d','/c','services\\api\\mvnw.cmd',...mvn]:['./services/api/mvnw',...mvn];
env.CODELESS_FINAL_STAGE_LOG=join(privateDir,'stages.jsonl');
writeFileSync(join(publicDir,'started.json'),JSON.stringify({head,mode,startedAt,command,dirty,sourceDigests},null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({evidence:relative(root,publicDir),head,mode}));
const fd=openSync(join(privateDir,'command.log'),'wx'),child=spawn(command[0],command.slice(1),{cwd:root,env,windowsHide:true,stdio:['ignore',fd,fd]});closeSync(fd);
const native=await new Promise(done=>{child.once('error',e=>done({exitCode:null,signal:null,launchError:e.code}));child.once('close',(exitCode,signal)=>done({exitCode,signal,launchError:null}));});
const restoredScreenshots=[];for(const [p,b]of screenshots)if(!existsSync(join(root,p))||hash(readFileSync(join(root,p)))!==hash(b)){writeFileSync(join(root,p),b);restoredScreenshots.push({path:p,digest:hash(b)});}
const junit=[];const junitDir=join(root,'services/api/target/surefire-reports');
for(const p of existsSync(junitDir)?readdirSync(junitDir).filter(p=>/^TEST-.*\.xml$/.test(p)):[]){
 const full=join(junitDir,p);if(statSync(full).mtimeMs<Date.parse(startedAt))continue;const b=readFileSync(full),attributes=b.toString().match(/<testsuite\b[^>]*>/)?.[0]??'';
 junit.push({...Object.fromEntries(['name','tests','failures','errors','skipped'].map(k=>[k,attributes.match(new RegExp('\\b'+k+'="([^"]*)"'))?.[1]??null])),sha256:hash(b)});writeFileSync(join(privateDir,p),b);
 if(p.includes('D25Quality')){const txt=join(junitDir,p.replace(/^TEST-/,'').replace(/\.xml$/,'.txt'));if(existsSync(txt))writeFileSync(join(publicDir,p.replace(/\.xml$/,'.txt')),readFileSync(txt));}
}
const caseDir=join(root,'services/api/target/d25-quality'),cases=[];
for(const name of existsSync(caseDir)?readdirSync(caseDir).filter(p=>p.endsWith('.json')):[]){
 const p=join(caseDir,name);if(statSync(p).mtimeMs<Date.parse(startedAt))continue;const bytes=readFileSync(p),c=JSON.parse(bytes);writeFileSync(join(privateDir,name),bytes);
 cases.push({case:c.case,status:c.task.status,failureCode:c.task.failureCode,paidRequests:0,measurement:c.measurement,originalBatch:c.originalBatch,
  originalSample:c.originalSample,originalSourceDigest:c.originalSourceDigest,historicalActionsDigest:c.historicalActionsDigest,proposedActions:c.proposedActions,
  wireRequests:c.wireRequests,meterSynthetic:c.meterSynthetic,repairAttempts:c.task.repairAttempts,invalid:c['model.invalid'],
  repairContext:c['repair.context'],actualRepairInputs:c.repairInputs.map(input=>({budget:input.budget,failure:input.failure,
   completionProposal:input.completionProposal,originalAcceptance:input.originalAcceptance,sourceFiles:input.sourceFiles,
   frozenFiles:(input.repairSources?.files??[]).map(f=>({path:f.path,digest:f.digest,contentSha256:hash(Buffer.from(f.content)),bytes:Buffer.byteLength(f.content),
    ...(f.path==='src/data/cafes.ts'?{content:f.content}:{})}))})),
  drafts:c.draft.map(d=>({versionId:d.versionId,sourceDigest:d.sourceDigest,actions:d.actions,files:d.files})),
  runs:c['runner.result'].map(r=>({status:r.status,sourceDigest:r.sourceDigest,build:{status:r.build?.status,exitCode:r.build?.exitCode,failure:r.build?.failure,log:r.build?.log},
   verification:r.verification?{status:r.verification.status,workerExitCode:r.verification.workerExitCode,failure:r.verification.failure,error:r.verification.error,
    diagnostics:r.verification.diagnostics,cleanup:r.verification.cleanup}:null})),fullPrivateReportSha256:hash(bytes)});
}
const log=readFileSync(join(privateDir,'command.log'));
const result={mode,head,startedAt,completedAt:new Date().toISOString(),command,...native,dirtyAtStart:dirty,
 status:native.exitCode===0&&!native.signal&&!native.launchError?'PASSED':'FAILED',paidModelCalls:0,modelCredentialPassed:false,
 logSha256:hash(log),logBytes:log.length,privateLog:relative(root,join(privateDir,'command.log')).replaceAll('\\','/'),
 sourceDigests,sourceBytesUnchanged:paths.every(p=>hash(readFileSync(join(root,p)))===sourceDigests[p]),headUnchanged:head===git('rev-parse','HEAD'),restoredScreenshots,junit,
 stages:existsSync(env.CODELESS_FINAL_STAGE_LOG)?readFileSync(env.CODELESS_FINAL_STAGE_LOG,'utf8').trim().split('\n').filter(Boolean).map(JSON.parse):[],
 summaries:log.toString().split(/\r?\n/).filter(s=>/^(?:ℹ |# )(?:tests|pass|fail|skipped) \d+|Tests run:/.test(s))};
writeFileSync(join(publicDir,'command.json'),JSON.stringify(result,null,2)+'\n',{flag:'wx'});
if(cases.length)writeFileSync(join(publicDir,'cases.json'),JSON.stringify(cases,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({evidence:relative(root,publicDir),...native,sourceBytesUnchanged:result.sourceBytesUnchanged,junit:junit.reduce((a,s)=>a+Number(s.tests),0),stages:result.stages}));
process.exitCode=native.exitCode??1;
