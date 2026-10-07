import assert from 'node:assert/strict'
import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises'
import { resolve, join, dirname } from 'node:path'
import { createHash } from 'node:crypto'

const root=resolve(process.argv[2])
const output=resolve('tests/agent/repair/evidence/2026-10-07')
const hash=bytes=>'sha256:'+createHash('sha256').update(bytes).digest('hex')
const load=async path=>JSON.parse(await readFile(path,'utf8'))
const acceptance=await load(join(root,'evidence/acceptance.json'))
const task=await load(join(root,'evidence/task.json'))
const calls=await load(join(root,'evidence/model-calls.json'))
assert.equal(acceptance.platformApiFixture,false);assert.equal(acceptance.signingFixture,false)
assert.equal(acceptance.modelProvider,'deepseek');assert.equal(task.status,'READY')
assert.equal(task.id,acceptance.taskId)
const journal=join(root,'private/journal',task.id)
const events=await Promise.all((await readdir(journal)).sort().map(name=>load(join(journal,name))))
const draft=events.findLast(event=>event.kind==='draft').payload
const runner=events.findLast(event=>event.kind==='runner.result').payload
assert.equal(runner.status,'VERIFIED');assert.equal(runner.sourceDigest,draft.sourceDigest)
const manifest=[]
for(const file of draft.files) {
  assert.match(file.path,/^src\/(?:pages|components)\/[A-Za-z][A-Za-z0-9_-]*\.vue$|^src\/data\/[A-Za-z][A-Za-z0-9_-]*\.ts$/)
  const bytes=await readFile(join(draft.sourceDirectory,file.path));assert.equal(hash(bytes),file.digest);assert.equal(bytes.length,file.bytes)
  manifest.push({path:file.path,bytes:file.bytes,digest:file.digest})
  const target=join(output,'source/real-platform',file.path);await mkdir(dirname(target),{recursive:true});await writeFile(target,bytes)
}
manifest.sort((a,b)=>a.path<b.path?-1:a.path>b.path?1:0);assert.equal(hash(JSON.stringify(manifest)),draft.sourceDigest)
const png=await readFile(join(root,'evidence',acceptance.screenshot.path));assert.equal(hash(png),acceptance.screenshot.digest);assert.equal(png.length,acceptance.screenshot.bytes)
await mkdir(join(output,'screenshots'),{recursive:true});await writeFile(join(output,'screenshots/real-platform.png'),png)
const privateFree=value=>{
  if(Array.isArray(value))return value.map(privateFree)
  if(value && typeof value==='object')return Object.fromEntries(Object.entries(value).map(([key,item])=>[key,
    ['directory','reportPath','path','containerName'].includes(key) && typeof item==='string' && !item.startsWith('src/')?'PRIVATE_VALUE_RETAINED_LOCALLY':privateFree(item)]))
  return value
}
await writeFile(join(output,'D10-A-real-platform.json'),JSON.stringify({acceptance:{...acceptance,screenshot:{...acceptance.screenshot,path:'screenshots/real-platform.png'}},
  task,modelCalls:calls,sourceDirectory:'source/real-platform',sourceManifest:manifest,runner:privateFree(runner),
  usage:events.filter(e=>e.kind==='model.usage').map(e=>e.payload),
  limitation:'This actual generated task required zero repair rounds; paid repair is evaluated separately.'},null,2)+'\n')
const repair=await load('.local-data/d10-a/real-repair-evidence/D10-A-real-repair.json')
const confirm=await load('.local-data/d10-a/real-repair-confirm-evidence/D10-A-real-repair.json')
const repairRuns=[repair,confirm]
const known=calls.filter(call=>call.inputTokens!==null && call.outputTokens!==null)
assert.equal(known.length,calls.length)
await writeFile(join(output,'runtime-usage.json'),JSON.stringify({scope:'D10-A paid runs only, separate from development agent and CI fixtures',
  attempts:calls.length+repairRuns.reduce((sum,run)=>sum+run.extra.modelCalls.length,0),knownUsageCalls:known.length,
  unknownUsageCalls:repairRuns.flatMap(run=>run.extra.modelCalls).filter(call=>call.inputTokens==null || call.outputTokens==null).length,
  knownInputTokens:known.reduce((sum,call)=>sum+call.inputTokens,0),knownOutputTokens:known.reduce((sum,call)=>sum+call.outputTokens,0),
  reportedKnownTotal:events.filter(e=>e.kind==='model.usage').reduce((sum,event)=>sum+event.payload.usage.totalTokens,0),
  completeTotalTokens:null,meteringSource:'REAL_PROVIDER_SQL_AND_PRIVATE_USAGE_AUDITS',
  paidGeneration:{status:'READY',repairAttempts:task.repairAttempts},paidRepair:repairRuns.map(run=>({taskId:run.task.id,
    status:run.task.status,failureCode:run.task.failureCode,budget:run.budget,
    estimatedCharges:run.events.filter(e=>e.kind==='model.usage').map(e=>e.payload)})),
  independentPaidRepairEvaluations:2,automaticNetworkRetries:0},null,2)+'\n')
console.log('Exported real-provider platform evidence and separate nullable runtime usage ledger')
