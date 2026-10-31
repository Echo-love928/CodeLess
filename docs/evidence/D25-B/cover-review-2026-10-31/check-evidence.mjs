import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync,readdirSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
const a=resolve(process.argv[2]??'.local-data/d25-cover-review'),base=join(a,'evals/results/D25-A/production-cover-2026-10-31'),out=resolve(process.argv[3]??'.local-data/d25-cover-independent');mkdirSync(out,{recursive:true});
const read=p=>JSON.parse(readFileSync(p)),sha=b=>'sha256:'+createHash('sha256').update(b).digest('hex');
const result={delivery:'54f347f7da3c39311003f682022c955a6769b76e',implementation:'45650b16981b04b6d65742befea8793b21f7a229',base:'380811d5270a72706fad0b1a74b7ffab8b97735a',quality:'HOLD',additionalPaidModelRequests:0,checkedAt:new Date().toISOString()};
const changed=execFileSync('git',['diff','--name-only',result.implementation,result.delivery],{cwd:a,encoding:'utf8'}).trim().split('\n').filter(Boolean);assert.ok(changed.every(p=>p.startsWith('docs/')||p.startsWith('evals/results/')));result.deliveryOnlyDocumentationAndEvidence=true;
const manifest=read(join(base,'publication-audit-checkpoint.json'));let exact=0;const mismatches=[];
for(const row of manifest.manifest){const b=execFileSync('git',['-c','core.longpaths=true','show',result.delivery+':'+row.path],{cwd:a,maxBuffer:10e6});if(b.length===row.bytes&&sha(b)===row.digest)exact++;else mismatches.push(row.path);}
assert.deepEqual(mismatches,[]);assert.equal(exact,manifest.files);result.manifest={files:exact,bytes:manifest.bytes,exactGitBlobMatches:exact};
const ci=read(join(base,'command-index.json'));const indexed=new Set();result.commandReceipts=[];
for(const r of ci.receipts){const actual=read(join(base,r.evidence));assert.equal(actual.exitCode,r.exitCode);assert.equal(actual.logSha256,r.logSha256);indexed.add(r.evidence);result.commandReceipts.push({file:r.evidence,exitCode:r.exitCode,logSha256:r.logSha256,rawLogIndependentHashVerified:false});}
for(const name of readdirSync(join(base,'commands')).filter(f=>f.endsWith('.json')))assert.ok(indexed.has('commands/'+name),'unindexed '+name);
const gates=read(join(base,'gates.json'));result.aGateEvidence={};
for(const [stage,data]of Object.entries(gates.stages)){for(const r of data.runs){const actual=read(join(base,r.evidence));assert.equal(actual.exitCode,r.exitCode);assert.equal(actual.logSha256,r.logSha256);}assert.equal(data.current.exitCode,0);result.aGateEvidence[stage]={currentExitCode:data.current.exitCode,allNativeExitCodes:data.runs.map(r=>r.exitCode)};}
result.rawLogLimitation='A full native logs remain private; B checked public receipts and summaries, did not independently hash the private raw logs or rerun all A gates.';
result.runs=[];
for(const dir of ['controlled-public','controlled-public-fixed']){const run=read(join(base,dir,'index.json'));const rows=run.results;let denied=0,success=0;const covers=[];
for(const r of rows){for(const o of r.ownership??[]){assert.equal(o.statusCode,o.expected);assert.equal(o.statusCode,o.who==='ANONYMOUS'?401:404);denied++;}if(!r.cover?.deploymentId){covers.push({sample:r.sample,unexecuted:true,metadataHttpStatus:r.metadataHttpStatus,apiError:r.cover?.code,keys:Object.keys(r)});continue;}const v=r.cover;assert.equal(v.deploymentId,r.publication.id);assert.equal(v.applicationId,r.publication.applicationId);assert.equal(v.versionId,r.publication.versionId);assert.ok(['SUCCEEDED','FAILED'].includes(v.status));
if(v.status==='SUCCEEDED'){success++;const png=readFileSync(join(base,dir,r.sample+'.png'));assert.equal(png.length,v.imageBytes);assert.equal(sha(png),v.imageDigest);assert.equal(png.readUInt32BE(16),1280);assert.equal(png.readUInt32BE(20),720);assert.equal(r.image.digest,v.imageDigest);assert.equal(r.image.statusCode,200);assert.equal(r.wrongDigestHttpStatus,404);}else {assert.equal(v.imageDigest,null);assert.equal(v.imageBytes,null);}
covers.push({sample:r.sample,versionId:v.versionId,entryPath:v.entryPath,status:v.status,attempts:v.attempts,imageDigest:v.imageDigest,imageBytes:v.imageBytes,failureCode:v.failureCode});}
result.runs.push({directory:dir,denominator:3,success,denied,covers,recordedExitCode:run.exitCode??null,sourceMetadataOnly:true});if(dir==='controlled-public-fixed'){assert.equal(success,2);assert.equal(denied,18);assert.equal(run.beforeModelCallRows,26);assert.equal(run.afterModelCallRows,26);assert.equal(run.readyAndPublicationRowsUnchanged,true);const task=covers.find(r=>r.sample==='EDIT-06');assert.equal(task.entryPath,'/tasks');assert.equal(task.status,'FAILED');assert.equal(task.attempts,2);}}
const retained=read(join(base,'runtime-retention.json'));assert.equal(retained.modelCallRowsAfterAllLocalGates,26);assert.equal(retained.modelCallRowsBefore,26);assert.equal(retained.failedTaskCoverPreserved.attempts,2);assert.equal(retained.vpsDeployed,false);result.runtimeRetention=retained;
const diagnostic=read(join(base,'dns-probes.json'));assert.equal(diagnostic.screenshotAttempts,0);assert.equal(diagnostic.existingFailedQueueUnchanged,true);assert.equal(diagnostic.diagnostics.filter(r=>r.targetResolved).length,2);result.task01Diagnosis={targetResolutionSuccess:2,newScreenshotAttempts:0,captureFailureRootCause:'UNKNOWN'};
const fault=read(join(base,'controlled-failure.json'));result.aControlledFailure=fault;
result.summary={coverSuccess:2,denominator:3,realGeneration:'NOT_EVALUATED',originalRequirements:'6/9',naturalFailed:'NOT_OBSERVED',vpsDeployed:false,bDirectPublicDns:'NOT_CLEARED'};
writeFileSync(join(out,'evidence-check.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({manifest:result.manifest,receipts:result.commandReceipts.length,runs:result.runs,summary:result.summary},null,2));
