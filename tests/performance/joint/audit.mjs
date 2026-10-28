import assert from 'node:assert/strict'
import { readFile, writeFile } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { pathToFileURL } from 'node:url'
export function qualify(r) {
  assert.equal(r.status,'PASSED');assert.equal(r.canonical,true);assert.equal(r.manualClaims,false);assert.equal(r.automaticClaims,true)
  assert.equal(r.rewrittenModelReplies,false);assert.equal(r.retries,0);assert.equal(r.onlineCutover,false)
  assert.match(r.commit,/^[a-f0-9]{40}$/);assert.match(r.composition.a,/^[a-f0-9]{40}$/);assert.match(r.composition.b,/^[a-f0-9]{40}$/)
  assert.deepEqual(r.changedSources,[]);assert.deepEqual(r.cleanupErrors,[]);assert.deepEqual(r.newRemainingContainers,[])
  assert.equal(r.databaseRemoved,true);assert.equal(r.hostingRemoved,true);assert.equal(r.faultScratchRemoved,true);assert.equal(r.collectorExitCode,0)
  assert.ok(r.clockCalibration.length>=10);for(const x of r.clockCalibration)assert.ok(BigInt(x.begin)<=BigInt(x.java)&&BigInt(x.java)<=BigInt(x.end))
  const starts=r.providerEvents.filter(x=>x.kind==='START'),ends=r.providerEvents.filter(x=>x.kind==='END')
  const calls=starts.map(s=>({start:s,end:ends.find(e=>e.attempt===s.attempt)}));assert.ok(calls.length>0)
  for(const c of calls){assert.ok(c.end,'Every attempted envelope must finish');assert.ok(BigInt(c.end.monotonicNs)>BigInt(c.start.monotonicNs));if(r.mode==='REAL'&&!c.end.errorCode)assert.equal(c.end.actualModel,'deepseek-flash')}
  for(const phase of ['cpu-with-real-provider','oom-confirmed-with-real-provider']){
    const samples=r.http.filter(x=>x.phase===phase);assert.equal(samples.length,10)
    for(const x of samples){assert.equal(x.status,200);assert.ok(BigInt(x.begin.monotonicNs)>=BigInt(x.barrier.monotonicNs));assert.ok(calls.some(c=>!['MODEL_CAPACITY_EXCEEDED','MODEL_BUDGET_EXCEEDED'].includes(c.end.errorCode)&&BigInt(c.start.monotonicNs)<=BigInt(x.begin.monotonicNs)&&BigInt(c.end.monotonicNs)>=BigInt(x.end.monotonicNs)),'Query must actually overlap a real provider envelope')}
  }
  assert.equal(r.faults.length,2)
  for(const f of r.faults){assert.equal(f.observed.error,undefined);assert.equal(f.result.exitCode,137);assert.equal(f.result.artifact,null);assert.deepEqual(f.result.cleanup,{containerRemoved:true,workspaceRemoved:true,errors:[]});assert.ok(BigInt(f.observed.value.release.monotonicNs)>BigInt(f.observed.value.barrier.monotonicNs));assert.equal(f.observed.value.endState.Running,true)}
  const oom=r.faults.find(f=>f.mode==='memory');assert.equal(oom.result.failure,'OOM');assert.equal(oom.observed.value.barrier.kind,'DOCKER_OOMKILLED_AND_CGROUP_OOM_KILL');assert.equal(oom.observed.value.endState.OOMKilled,true)
  assert.ok(r.http.filter(x=>x.phase==='pre-pressure-negative-control').length===10)
  for(const phase of ['baseline','timeout-after-cleanup','memory-after-cleanup','final-after-faults'])assert.equal(r.http.filter(x=>x.phase===phase&&x.status===200).length,10)
  assert.equal(r.tasks.length,4);assert.deepEqual(r.tasks.filter(t=>t.terminal==='READY').map(t=>t.marker).sort(),['FIRST','SECOND'])
  assert.equal(r.tasks.find(t=>t.marker==='CANCEL').failureCode,'CANCELLED');assert.equal(r.tasks.find(t=>t.marker==='FAIL').failureCode,'AGENT_RUNNER_UNAVAILABLE')
  const cancelled=calls.find(c=>c.start.attempt===r.cancellation.providerAttempt);assert.ok(cancelled);assert.ok(BigInt(cancelled.start.monotonicNs)<BigInt(r.cancellation.requested.monotonicNs));assert.ok(BigInt(cancelled.end.monotonicNs)>BigInt(r.cancellation.completed.monotonicNs),'Cancellation must occur while the actual provider envelope remains unfinished')
  assert.ok(r.sse.length>=3);assert.ok(r.sse.some(x=>x.cursor>0));for(const x of r.sse)assert.ok(x.sequences.length&&x.sequences.every(v=>v>x.cursor))
  assert.equal(r.publications.length,2);assert.ok(r.publications.every(x=>x.phase==='SUCCEEDED'&&x.browserReadback&&x.observations.at(-1)?.history?.at(-1)?.phase==='SUCCEEDED'))
  assert.equal(r.retained.browserReadback,true);assert.equal(r.retained.explicitHostFault,true);assert.match(r.retained.exportSha256,/^sha256:[a-f0-9]{64}$/)
  assert.deepEqual(r.crossUser,[404,404]);assert.ok(r.financial.reservedUpperRmb<=2);assert.equal(r.financial.actualDebitedRmb,null)
  assert.equal(r.sql.tasks.length,4);assert.ok(r.sql.models.length);assert.ok(r.sql.models.every(x=>x.provider===(r.mode==='REAL'?'deepseek':'deterministic-mock')))
  assert.equal(r.sql.builds.filter(x=>x.status==='SUCCEEDED'&&x.exitCode===0).length,2)
  return {qualified:true,scope:r.scope,mode:r.mode,commit:r.commit,composition:r.composition,paidAttemptUpperBound:r.mode==='REAL'?starts.length:0,
    httpCount:r.http.length,providerOverlappedHttpCount:20,clockSamples:r.clockCalibration.length,taskCount:4,readyCount:2,
    repairCoverage:r.repairCoverage,publicationCount:2,retained:true,reservedUpperRmb:r.financial.reservedUpperRmb,actualDebitedRmb:null}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  const out=resolve(process.argv[2]),r=JSON.parse(await readFile(join(out,'report.json'),'utf8')),result=qualify(r)
  await writeFile(join(out,'audit.json'),JSON.stringify(result,null,2)+'\n',{flag:'wx',mode:0o600});console.log(JSON.stringify(result))
}
