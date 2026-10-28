import test from 'node:test'
import assert from 'node:assert/strict'
import { qualify } from './audit.mjs'
const point=n=>({monotonicNs:String(n)})
function fixture(){
  const phases=['baseline','cpu-with-real-provider','timeout-after-cleanup','pre-pressure-negative-control','oom-confirmed-with-real-provider','memory-after-cleanup','final-after-faults']
  const fault=mode=>({mode,result:{exitCode:137,artifact:null,failure:mode==='memory'?'OOM':'TIMEOUT',cleanup:{containerRemoved:true,workspaceRemoved:true,errors:[]}},
    observed:{value:{barrier:{kind:mode==='memory'?'DOCKER_OOMKILLED_AND_CGROUP_OOM_KILL':'CPU_LOOP_AND_USAGE_GROWTH',...point(10)},release:point(900),endState:{Running:true,OOMKilled:mode==='memory'}}}})
  return {status:'PASSED',canonical:true,manualClaims:false,automaticClaims:true,rewrittenModelReplies:false,retries:0,onlineCutover:false,mode:'REAL',
    commit:'a'.repeat(40),composition:{a:'b'.repeat(40),b:'c'.repeat(40)},changedSources:[],cleanupErrors:[],newRemainingContainers:[],databaseRemoved:true,hostingRemoved:true,faultScratchRemoved:true,collectorExitCode:0,
    clockCalibration:Array.from({length:10},()=>({begin:'1',java:'2',end:'3'})),
    providerEvents:[{kind:'START',attempt:1,...point(20)},{kind:'END',attempt:1,...point(800),errorCode:'',actualModel:'deepseek-flash'},
      {kind:'START',attempt:2,...point(1000)},{kind:'END',attempt:2,...point(2000),errorCode:'',actualModel:'deepseek-flash'}],
    http:phases.flatMap(phase=>Array.from({length:10},()=>({phase,status:200,begin:point(30),end:point(40),barrier:point(10)}))),
    faults:[fault('timeout'),fault('memory')],tasks:[{marker:'FIRST',terminal:'READY'},{marker:'SECOND',terminal:'READY'},{marker:'CANCEL',terminal:'FAILED',failureCode:'CANCELLED'},{marker:'FAIL',terminal:'FAILED',failureCode:'AGENT_RUNNER_UNAVAILABLE'}],
    cancellation:{providerAttempt:2,requested:point(1100),completed:point(1200)},sse:[{cursor:0,sequences:[1,2]},{cursor:1,sequences:[2]},{cursor:2,sequences:[3]}],
    publications:Array.from({length:2},()=>({phase:'SUCCEEDED',browserReadback:true,observations:[{history:[{phase:'SUCCEEDED'}]}]})),
    retained:{browserReadback:true,explicitHostFault:true,exportSha256:'sha256:'+'d'.repeat(64)},crossUser:[404,404],financial:{reservedUpperRmb:.8,actualDebitedRmb:null},
    sql:{tasks:Array(4).fill({}),models:[{provider:'deepseek'}],builds:Array.from({length:2},()=>({status:'SUCCEEDED',exitCode:0}))}}
}
test('joint audit accepts only a complete controlled fixture (no workload execution)',()=>assert.equal(qualify(fixture()).qualified,true))
test('Running-only OOM, early pressure queries and queries after provider completion are rejected',()=>{
  for(const mutate of [r=>r.faults[1].observed.value.barrier.kind='RUNNING',r=>r.http[10].begin=point(1),r=>r.http[10].end=point(801)]){const r=fixture();mutate(r);assert.throws(()=>qualify(r))}
})
test('late cancellation, missing ledger terminal, budget overrun and incomplete cleanup are rejected',()=>{
  for(const mutate of [r=>r.cancellation.completed=point(2100),r=>r.publications[0].observations[0].history=[],r=>r.financial.reservedUpperRmb=2.01,r=>r.newRemainingContainers=['owned-container'],r=>r.collectorExitCode=1]){const r=fixture();mutate(r);assert.throws(()=>qualify(r))}
})
