// Export only public, deterministic acceptance observations. Raw HTTP credentials/model transport remain private.
import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {readFile,writeFile,readdir,mkdir,cp} from 'node:fs/promises'
import {fileURLToPath} from 'node:url'
import {join,relative} from 'node:path'
const repo=fileURLToPath(new URL('../../',import.meta.url)),raw=join(repo,'.local-data/d15-a/runs'),out=join(repo,'tests/deploy/evidence/2026-10-14')
const hash=b=>'sha256:'+createHash('sha256').update(b).digest('hex'),read=async p=>JSON.parse(await readFile(p,'utf8'))
const entries=async p=>{try{return await readdir(p,{withFileTypes:true})}catch(e){if(e.code==='ENOENT')return [];throw e}}
await mkdir(out,{recursive:true})
const commands=[],versions=new Set();let canonical=null
const names=['prerequisite','D15-A-T1','D15-A-T2','D15-A-T3','D15-A-T4','boundaries','tampering']
for(const dir of (await entries(raw)).filter(d=>d.isDirectory()).sort((a,b)=>a.name.localeCompare(b.name))) {
  const path=join(raw,dir.name),meta=await read(join(path,'run.json'));if(meta.status==='RUNNING')continue
  const log=await readFile(join(path,'command.log'));assert.equal(hash(log),meta.logDigest)
  const target=join(out,'runs',dir.name);await mkdir(target,{recursive:true})
  const text=log.toString('utf8'),lines=text.split(/\r?\n/).filter(l=>/\[ci-gate\]|Tests run:|Test set:|BUILD (SUCCESS|FAILURE)|# (tests|pass|fail|skipped) |ℹ (tests|pass|fail|skipped) |Test Files|Tests +\d|\d+ passed \(|\d+ failed|Duration |DirectoryNotEmpty|Owned cleanup diagnostic|expected:| but was:/.test(l))
  await writeFile(join(target,'summary.log'),lines.join('\n')+'\n')
  const junit=[]
  for(const f of await entries(join(path,'junit')))if(f.name.endsWith('.txt')&&text.includes('Running '+f.name.slice(0,-4))) {
    const bytes=await readFile(join(path,'junit',f.name)),m=bytes.toString().match(/Tests run: (\d+), Failures: (\d+), Errors: (\d+), Skipped: (\d+)/)
    if(m)junit.push({suite:f.name,tests:+m[1],failures:+m[2],errors:+m[3],skipped:+m[4],digest:hash(bytes)})
  }
  const observation={...meta,junit,privateLog:relative(repo,join(path,'command.log')).replaceAll('\\','/'),summary:'runs/'+dir.name+'/summary.log'}
  await writeFile(join(target,'command.json'),JSON.stringify(observation,null,2)+'\n');commands.push(observation)
  await mkdir(join(target,'deploy'),{recursive:true})
  for(const name of names)try {
    const bytes=await readFile(join(path,'deploy',name+'.json'));JSON.parse(bytes)
    await writeFile(join(target,'deploy',name+'.json'),bytes)
    if(name==='prerequisite')versions.add(JSON.parse(bytes).versionId)
  }catch(e){if(e.code!=='ENOENT')throw e}
  const card=junit.find(s=>s.suite==='dev.codeless.api.deploy.PublicationIntegrationTest.txt')
  const ended=meta.status==='PASSED'&&meta.completionVerified || meta.mode==='gate'&&text.includes('[ci-gate] failed with exit code')
  if(ended&&card?.tests===6&&card.failures===0&&card.errors===0&&card.skipped===0)canonical={run:dir.name,target,head:meta.head,cardSuiteStatus:'PASSED',commandStatus:meta.status,commandExitCode:meta.exitCode}
}
if(canonical) {
  for(const name of names)await readFile(join(canonical.target,'deploy',name+'.json')) // incomplete evidence cannot become canonical
  await cp(join(canonical.target,'deploy'),join(out,'verified'),{recursive:true})
  const {target,...publicCanonical}=canonical;await writeFile(join(out,'canonical.json'),JSON.stringify(publicCanonical,null,2)+'\n')
}
await writeFile(join(out,'commands.json'),JSON.stringify(commands,null,2)+'\n')
const usage=[]
const journal=join(repo,'services/api/target/deploy-integration/runtime/journal')
for(const dir of (await entries(journal)).filter(d=>d.isDirectory())) {
  const events=[]
  for(const f of (await entries(join(journal,dir.name))).sort((a,b)=>a.name.localeCompare(b.name)))if(/^\d{4}\.json$/.test(f.name))events.push(await read(join(journal,dir.name,f.name)))
  if(!events.some(e=>e.kind==='draft'&&versions.has(e.payload.versionId)))continue
  const calls=events.filter(e=>e.kind==='model.request'),observed=events.filter(e=>e.kind==='model.usage')
  let charged=0,tools=0
  for(const e of events) {
    if(e.kind==='model.request')charged+=e.payload.reservedTokens
    if(e.kind==='tool.request')tools+=e.payload.slots??1
    if(e.kind==='model.usage'){charged-=e.payload.releasedTokens;charged+=Math.max(0,e.payload.chargedTokens-e.payload.reservationTokens)}
  }
  const sum=field=>observed.length===calls.length&&observed.every(e=>Number.isInteger(e.payload.usage?.[field]))?observed.reduce((n,e)=>n+e.payload.usage[field],0):null
  usage.push({taskId:dir.name,provider:'deterministic-mock',modelRequests:calls.length,toolSlots:tools,inputTokens:sum('inputTokens'),outputTokens:sum('outputTokens'),totalTokens:sum('totalTokens'),chargedTokens:charged,
    usage:observed.map(e=>({usage:e.payload.usage??null,chargedTokens:e.payload.chargedTokens,source:e.payload.source,estimated:e.payload.estimated}))})
}
await writeFile(join(out,'runtime-usage.json'),JSON.stringify({source:'private journal matched by acceptance versionId; distinct tasks across all completed card runs',paidModelCalls:0,realModelQualityEvaluated:false,aggregateInputTokens:null,aggregateOutputTokens:null,aggregateTotalTokens:null,tasks:usage},null,2)+'\n')
console.log(JSON.stringify({commands:commands.length,canonical:canonical?.run??null,runtimeTasks:usage.length}))
