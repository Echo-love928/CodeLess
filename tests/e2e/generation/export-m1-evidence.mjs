import assert from 'node:assert/strict'
import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises'
import { resolve, join, dirname } from 'node:path'
import { createHash } from 'node:crypto'

// Closed export of a single actual paid task. Failed/unknown outcomes remain failed/unknown.
const input=resolve(process.argv[2])
const report=JSON.parse(await readFile(join(input,'D10-M1-real-same-task.json'),'utf8'))
assert.equal(report.modelProvider,'deepseek')
const taskId=report.task.id
assert.match(taskId,/^[0-9a-f-]{36}$/)
const output=resolve('docs/evidence/D10/M1',taskId)
const hash=b=>'sha256:'+createHash('sha256').update(b).digest('hex')
const portable=value=>Array.isArray(value)?value.map(portable):value&&typeof value==='object'
  ?Object.fromEntries(Object.entries(value).map(([key,item])=>[key,
    typeof item==='string'&&['directory','sourceDirectory','reportPath','path'].includes(key)
    &&!(key==='path'&&value.type==='navigate')&&(/^[A-Za-z]:[\\/]/.test(item)||item.startsWith('/'))
      ?'PRIVATE_PATH_RETAINED_LOCALLY':portable(item)])):value
const candidates=[],runners=[]
await mkdir(output,{recursive:true})
for(const event of report.events){
  if(event.kind==='draft'){
    const candidate=event.payload,manifest=[],relative=`source/candidate-${candidates.length}`
    for(const file of candidate.files){
      assert.match(file.path,/^src\/(?:pages|components)\/[A-Za-z][A-Za-z0-9_-]*\.vue$|^src\/data\/[A-Za-z][A-Za-z0-9_-]*\.ts$/)
      const bytes=await readFile(join(candidate.sourceDirectory,file.path))
      assert.equal(bytes.length,file.bytes);assert.equal(hash(bytes),file.digest)
      manifest.push({path:file.path,bytes:file.bytes,digest:file.digest})
      const target=join(output,relative,file.path);await mkdir(dirname(target),{recursive:true});await writeFile(target,bytes)
    }
    manifest.sort((a,b)=>a.path<b.path?-1:a.path>b.path?1:0)
    assert.equal(hash(JSON.stringify(manifest)),candidate.sourceDigest)
    candidates.push({...portable(candidate),sourceDirectory:relative})
  }
  if(event.kind==='runner.result'){
    const runner=portable(event.payload),screenshot=event.payload.verification?.screenshot
    if(screenshot){const bytes=await readFile(screenshot.path);assert.equal(hash(bytes),screenshot.digest);assert.equal(bytes.length,screenshot.bytes)
      const relative=`screenshots/runner-${runners.length}.png`;await mkdir(join(output,'screenshots'),{recursive:true});await writeFile(join(output,relative),bytes);runner.verification.screenshot.path=relative}
    runners.push(runner)
  }
}
const extra=portable(report.extra)
if(extra.acceptance?.screenshot){const screenshot=extra.acceptance.screenshot;assert.equal(screenshot.path,'authenticated-platform-preview.png')
  const bytes=await readFile(join(input,screenshot.path));assert.equal(hash(bytes),screenshot.digest);assert.equal(bytes.length,screenshot.bytes)
  await mkdir(join(output,'screenshots'),{recursive:true});await writeFile(join(output,'screenshots/platform.png'),bytes);screenshot.path='screenshots/platform.png'}
let fault=null
try{const original=JSON.parse(await readFile(join(input,'controlled-fault.json'),'utf8'));assert.equal(hash(original.before),original.beforeDigest);assert.equal(hash(original.after),original.afterDigest)
  fault={path:original.path,origin:original.origin,before:original.before,after:original.after,beforeDigest:original.beforeDigest,afterDigest:original.afterDigest}
}catch(error){if(error.code!=='ENOENT')throw error}
const calls=extra.modelCalls??[],usage=report.events.filter(x=>x.kind==='model.usage').map(x=>({stage:x.stage,...x.payload}))
const measured=calls.filter(x=>x.inputTokens!==null&&x.outputTokens!==null),unknown=calls.length-measured.length
const record={task:report.task,budget:report.budget,modelProvider:report.modelProvider,modelQualityEvidence:report.modelQualityEvidence,
  extra,fault,candidates,runners,usage,protocolResponses:report.events.filter(x=>x.kind==='model.response').map(x=>({stage:x.stage,payload:portable(x.payload)})),decisions:report.events.filter(x=>['repair.failure','failure','completion','stage.finished'].includes(x.kind)).map(portable),
  measuredUsage:{attempts:calls.length,knownAttempts:measured.length,unknownAttempts:unknown,inputTokens:measured.reduce((s,c)=>s+c.inputTokens,0),outputTokens:measured.reduce((s,c)=>s+c.outputTokens,0),completeTotalTokens:unknown===0?measured.reduce((s,c)=>s+c.inputTokens+c.outputTokens,0):null},
  historicalEvidencePreserved:['tests/agent/repair/evidence/2026-10-07/D10-A-real-repair.json','tests/agent/repair/evidence/2026-10-07/D10-A-real-repair-confirm.json','tests/agent/repair/evidence/2026-10-07/D10-A-local-api-failure.json','tests/agent/repair/evidence/2026-10-07/followup.json']}
if(report.modelQualityEvidence){assert.equal(extra.M1,'PASSED');assert.equal(report.task.status,'READY');assert.ok(report.task.repairAttempts>=1&&report.task.repairAttempts<=3);assert.equal(extra.controlledFaultInjected,1);assert.ok(candidates.length>=2);assert.equal(extra.acceptance.taskId,taskId);assert.equal(extra.acceptance.versionId,candidates.at(-1).versionId);assert.equal(extra.acceptance.platformApiFixture,false);assert.equal(extra.acceptance.signingFixture,false);assert.equal(runners.at(-1).verification.status,'PASSED');for(const candidate of candidates)assert.deepEqual(candidate.actions,candidates[0].actions);assert.ok(calls.some(x=>x.stage==='REPAIR'));assert.ok(calls.every(x=>x.provider==='deepseek'));assert.ok(report.budget.models<=12&&report.budget.tools<=20&&report.budget.chargedTokens<=50000)}
await writeFile(join(output,'acceptance.json'),JSON.stringify(record,null,2)+'\n')
const commands=[]
for(const stem of ['install','test-compile','ci-gate-first','ci-gate-env-fixed','ci-gate-controlled-env','m1-real','m1-real-second','m1-real-third','late-fault-isolated']){try{const bytes=await readFile(`.local-data/d10-m1/${stem}.log`),exit=Number((await readFile(`.local-data/d10-m1/${stem}.exit`,'utf8')).trim());assert.ok(Number.isInteger(exit));commands.push({stem,exitCode:exit,log:`.local-data/d10-m1/${stem}.log`,logDigest:hash(bytes)})}catch(error){if(error.code!=='ENOENT')throw error;commands.push({stem,status:'NOT_RECORDED',exitCode:null})}}
await writeFile(join(output,'commands.json'),JSON.stringify(commands,null,2)+'\n')
console.log(JSON.stringify({output,taskId,status:report.task.status,M1:extra.M1,usage:record.measuredUsage,candidates:candidates.length,runners:runners.length}))
