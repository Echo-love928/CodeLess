import assert from 'node:assert/strict'
import {buildCleanupEvidence,browserCleanupEvidence} from './preview-diagnostic-projection.mjs'
import {readFile,writeFile,readdir,mkdir} from 'node:fs/promises'
import {resolve,join,dirname} from 'node:path'
import {readSnapshot,digest} from '../../services/runner/src/artifacts/snapshot.mjs'

// Export allowlisted evidence, never raw HTTP data, provider messages or credentials.
const [runtimeArg,name,commit,logArg,exitArg]=process.argv.slice(2)
assert.ok(runtimeArg&&logArg&&exitArg,'runtime name commit log exit-file are required')
assert.match(name,/^[a-z][a-z0-9-]+$/);assert.match(commit,/^[a-f0-9]{40}$/)
const runtime=resolve(runtimeArg),output=resolve(import.meta.dirname,'evidence/2026-10-05/diagnostics',name)
const json=async file=>JSON.parse(await readFile(file,'utf8'))
const safeBytes=bytes=>{const key=process.env.CODELESS_MODEL_API_KEY;if(key)assert.ok(!bytes.toString().includes(key),'Credential must not be exported');return bytes}
const save=async (file,value)=>{const path=join(output,file);await mkdir(dirname(path),{recursive:true});await writeFile(path,safeBytes(Buffer.from(JSON.stringify(value,null,2)+'\n')))}
const task=await json(join(runtime,'evidence/task.json')),calls=await json(join(runtime,'evidence/model-calls.json'))
const root=join(runtime,'private/journal',task.id)
const events=await Promise.all((await readdir(root)).sort().map(file=>json(join(root,file))))
const draft=events.findLast(e=>e.kind==='draft')?.payload,runner=events.findLast(e=>e.kind==='runner.result')?.payload
const usages=events.filter(e=>e.kind==='model.usage').map(e=>e.payload.usage)
assert.equal(calls.length,usages.length)
let inputTokens=0,outputTokens=0,providerReportedTotal=0
const safeCalls=calls.map((call,i)=>{
  assert.equal(call.provider,'deepseek');assert.equal(call.model,'deepseek-flash');assert.equal(call.status,'SUCCEEDED')
  for(const field of ['inputTokens','outputTokens','totalTokens'])assert.ok(Number.isInteger(usages[i][field]))
  assert.equal(call.inputTokens,usages[i].inputTokens);assert.equal(call.outputTokens,usages[i].outputTokens)
  inputTokens+=call.inputTokens;outputTokens+=call.outputTokens;providerReportedTotal+=usages[i].totalTokens
  return {id:call.id,stage:call.stage,provider:call.provider,model:call.model,status:call.status,inputTokens:call.inputTokens,outputTokens:call.outputTokens,providerReportedTotal:usages[i].totalTokens}
})
const toolResults=await Promise.all(events.filter(e=>e.kind==='tool.result').map(async e=>{
  const request=await json(join(runtime,'file-audit',task.id,e.payload.callId+'.request.json'))
  assert.equal(request.callId,e.payload.callId);assert.match(request.input.tool,/^files\.(create|read|update|list)$/)
  if(request.input.path)assert.match(request.input.path,/^src\/(components|pages)\/[A-Za-z][A-Za-z0-9]*\.vue$/)
  return {sequence:e.sequence,callId:e.payload.callId,tool:request.input.tool,path:request.input.path??null,status:e.payload.status,errorCode:e.payload.errorCode,source:e.payload.source}
}))
const inventory=events.findLast(e=>e.kind==='tool.result')?.payload.source
const source=draft?{directory:draft.sourceDirectory,digest:draft.sourceDigest,files:draft.files}:inventory?{directory:join(runtime,'workspaces',task.id,'source'),digest:inventory.sourceDigest,files:inventory.files}:null
if(source){
  assert.equal((await readSnapshot(source.directory,{source:true})).manifest.digest,source.digest)
  for(const file of source.files){
    assert.match(file.path,/^src\/(components|pages)\/[A-Za-z][A-Za-z0-9]*\.vue$/)
    const bytes=await readFile(join(source.directory,file.path));assert.equal(bytes.length,file.bytes);assert.equal(digest(bytes),file.digest)
    const path=join(output,'source',file.path);await mkdir(dirname(path),{recursive:true});await writeFile(path,safeBytes(bytes))
  }
}
if(runner){
  assert.deepEqual(await json(join(runtime,'private/receipts',runner.executionId+'.json')),runner)
  assert.equal(runner.sourceDigest,draft.sourceDigest)
  if(runner.build.artifact){
    const artifact=await readSnapshot(runner.build.artifact.directory)
    assert.equal(artifact.manifest.digest,runner.build.artifact.digest);assert.deepEqual(artifact.manifest.files,runner.build.artifact.files)
  }
  if(runner.verification){
    assert.deepEqual(await json(runner.verification.reportPath),runner.verification)
    const shot=runner.verification.screenshot
    if(shot){const bytes=await readFile(shot.path);assert.equal(digest(bytes),shot.digest);assert.equal(bytes.length,shot.bytes);await writeFile(join(output,'generated-browser.png'),bytes)}
  }
}
const diagnostics=await json(join(runtime,'evidence/platform-diagnostics.json'))
assert.equal(diagnostics.modelMode,'deepseek');assert.equal(diagnostics.platformApiFixture,false);assert.equal(diagnostics.signingFixture,false)
assert.ok(diagnostics.events.length<=256)
await save('platform-diagnostics.json',diagnostics)
const outerExit=Number((await readFile(resolve(exitArg),'utf8')).trim()),rawLog=await readFile(resolve(logArg))
assert.ok(Number.isInteger(outerExit))
let acceptance=null
try {acceptance=await json(join(runtime,'evidence/acceptance.json'))}catch(error){if(error.code!=='ENOENT')throw error}
if(acceptance){assert.equal(outerExit,0);assert.equal(acceptance.modelQualityAccepted,true);assert.equal(task.status,'READY');await save('acceptance.json',acceptance)}
const verification=runner?.verification
await save('result.json',{sourceCommit:commit,command:'services/api/mvnw.cmd -f services/api/pom.xml -Dtest=RealPreviewPlatformAcceptanceIT test',exitCode:outerExit,
  modelProvider:'deepseek',configuredModel:'deepseek-flash',fixture:false,platformApiFixture:false,signingFixture:false,fullPlatformAcceptance:Boolean(acceptance),
  task:{id:task.id,applicationId:task.applicationId,status:task.status,failureCode:task.failureCode??null,repairAttempts:task.repairAttempts},
  draft:draft?{versionId:draft.versionId,sourceDigest:draft.sourceDigest,files:draft.files,actions:draft.actions}:null,
  sourceSnapshot:source?{digest:source.digest,files:source.files}:null,
  toolResults,
  runner:runner?{executionId:runner.executionId,status:runner.status,sourceDigest:runner.sourceDigest,build:{id:runner.build.id,status:runner.build.status,exitCode:runner.build.exitCode,failure:runner.build.failure,artifactDigest:runner.build.artifact?.digest,cleanup:buildCleanupEvidence(runner.build.cleanup)},
    verification:verification?{id:verification.id,buildId:verification.buildId,status:verification.status,failure:verification.failure,phase:verification.phase,workerExitCode:verification.workerExitCode,actionResults:verification.diagnostics?.actions,errorDigest:verification.error?digest(Buffer.from(verification.error)):null,cleanup:browserCleanupEvidence(verification.cleanup)}:null}:null,
  failure:events.findLast(e=>e.kind==='failure')?.payload??null,completion:events.findLast(e=>e.kind==='completion')?.payload??null,
  runtimeUsage:{requests:calls.length,inputTokens,outputTokens,providerReportedTotal,unknownUsageCalls:0,measurement:'PROVIDER_RESPONSE_AND_SQL'},calls:safeCalls,
  rawLog:{shared:false,bytes:rawLog.length,digest:digest(rawLog)},credentialShared:false})
console.log(JSON.stringify({output,exitCode:outerExit,taskStatus:task.status,fullPlatformAcceptance:Boolean(acceptance),requests:calls.length,inputTokens,outputTokens,providerReportedTotal}))
