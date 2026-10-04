import assert from 'node:assert/strict'
import {readFile,writeFile,mkdir,readdir} from 'node:fs/promises'
import {resolve,join,dirname} from 'node:path'
import {execFileSync} from 'node:child_process'
import {readSnapshot,digest} from '../../services/runner/src/artifacts/snapshot.mjs'

const checkout=resolve(import.meta.dirname,'../..'),logs=process.env.CODELESS_AGENT_PLATFORM_LOG_DIR
assert.ok(logs,'Set CODELESS_AGENT_PLATFORM_LOG_DIR to the preserved private evaluation logs')
const target=join(checkout,'services/api/target'),output=join(checkout,'tests/agent/evidence/2026-10-05/platform')
await mkdir(output,{recursive:true})
const normalize=value=>JSON.parse(JSON.stringify(value).replaceAll(checkout.replaceAll('\\','\\\\'),'/workspace').replaceAll(checkout.replaceAll('\\','/'),'/workspace'))
const save=async(name,value)=>writeFile(join(output,name),JSON.stringify(normalize(value),null,2)+'\n')
const attempts=[
 ['first','real-platform-first','real-preview-platform-7d891c57-a8e1-4756-85f2-f8343b910579','2abc81ec95b54e39e6decc573f54fb94e39285fb'],
 ['create-first','real-platform-create-first','real-preview-platform-bef2a556-0b91-4990-a059-7fef0469ddb9','be06005958275bd8dc829e75e4477ce6cf228b8d'],
 ['closed-protocol','real-platform-closed-protocol','real-preview-platform-6331d8e5-6610-42e1-896e-e7dc9409172f','481f4884b58be5f79ae0140be5e69ef635432f1d'],
]
const roots=(await readdir(target)).filter(name=>name.startsWith('real-preview-platform-')&&!attempts.some(a=>a[2]===name))
assert.equal(roots.length,1,'Expected exactly one unique-targets evaluation runtime')
attempts.push(['unique-targets','real-platform-unique-targets',roots[0],'f32fb3ffd9a0bb7deb53c560c764401a95aa5e6c'])
let requests=0,input=0,completion=0,total=0
const commands=[]
for(const [name,logName,runtimeName,commit] of attempts){
 const runtime=join(target,runtimeName),evidence=join(runtime,'evidence')
 const started=JSON.parse(await readFile(join(evidence,'started.json'),'utf8')),task=JSON.parse(await readFile(join(evidence,'task.json'),'utf8'))
 const calls=JSON.parse(await readFile(join(evidence,'model-calls.json'),'utf8'))
 const journalRoot=join(runtime,'private/journal',started.taskId)
 const events=await Promise.all((await readdir(journalRoot)).sort().map(async file=>JSON.parse(await readFile(join(journalRoot,file),'utf8'))))
 const usages=events.filter(e=>e.kind==='model.usage').map(e=>e.payload.usage)
 assert.equal(usages.length,calls.length)
 for(const [i,call] of calls.entries()){
  assert.equal(call.provider,'deepseek');assert.equal(call.model,'deepseek-flash');assert.equal(call.status,'SUCCEEDED')
  assert.ok(Number.isInteger(call.inputTokens)&&Number.isInteger(call.outputTokens));assert.equal(usages[i].inputTokens,call.inputTokens);assert.equal(usages[i].outputTokens,call.outputTokens)
  assert.ok(Number.isInteger(usages[i].totalTokens));requests++;input+=call.inputTokens;completion+=call.outputTokens;total+=usages[i].totalTokens
 }
 let exitCode=null;try{exitCode=Number((await readFile(join(logs,logName+'.exit'),'utf8')).trim())}catch(error){if(error.code!=='ENOENT')throw error}
 const log=await readFile(join(logs,logName+'.log'))
 commands.push({command:'services/api/mvnw.cmd -f services/api/pom.xml -Dtest=RealPreviewPlatformAcceptanceIT test',name,commit,exitCode,exitMeasurement:exitCode===null?'UNKNOWN_INTERRUPTED_TOOL_SESSION':'ACTUAL_EXIT_FILE',taskStatus:task.status,failureCode:task.failureCode??null,rawLog:logName+'.log',logDigest:digest(log),logBytes:log.length})
 const draft=events.findLast(e=>e.kind==='draft')?.payload,runner=events.findLast(e=>e.kind==='runner.result')?.payload
 const inventory=draft?.files??events.findLast(e=>e.kind==='tool.result')?.payload.source.files??[]
 const source=draft?.sourceDirectory??join(runtime,'workspaces',started.taskId,'source')
 for(const file of inventory){
  assert.match(file.path,/^src\/(pages|components)\/[A-Za-z][A-Za-z0-9]*\.vue$/)
  const bytes=await readFile(join(source,file.path));assert.equal(bytes.length,file.bytes);assert.equal(digest(bytes),file.digest)
  const path=join(output,'source',name,file.path);await mkdir(dirname(path),{recursive:true});await writeFile(path,bytes)
 }
 await save('attempt-'+name+'.json',{commit,fixture:false,generationAccepted:task.status==='READY'&&runner?.status==='VERIFIED',fullPlatformModelAcceptance:false,platformPreview:task.status==='READY'?'FAILED_PLATFORM_IFRAME_LOAD':'NOT_REACHED',started,task,calls,events})
 if(name==='unique-targets'){
  assert.equal(exitCode,1);assert.equal(task.status,'READY')
  assert.equal(runner.status,'VERIFIED');assert.equal(runner.build.exitCode,0);assert.equal(runner.verification.status,'PASSED')
  const completed=events.findLast(e=>e.kind==='completion').payload
  assert.equal(completed.versionId,draft.versionId);assert.equal(completed.buildId,runner.build.id);assert.equal(completed.verificationId,runner.verification.id)
  assert.equal(completed.sourceDigest,draft.sourceDigest);assert.equal(completed.artifactDigest,runner.build.artifact.digest)
  const snapshot=await readSnapshot(source,{source:true});assert.equal(snapshot.manifest.digest,draft.sourceDigest)
  const artifact=await readSnapshot(runner.build.artifact.directory);assert.equal(artifact.manifest.digest,runner.build.artifact.digest)
  assert.deepEqual(artifact.manifest.files,runner.build.artifact.files)
  assert.deepEqual(JSON.parse(await readFile(join(runtime,'private/receipts',runner.executionId+'.json'),'utf8')),runner)
  assert.deepEqual(JSON.parse(await readFile(runner.verification.reportPath,'utf8')),runner.verification)
  const verification=await readFile(runner.verification.screenshot.path);assert.equal(digest(verification),runner.verification.screenshot.digest);assert.equal(verification.length,runner.verification.screenshot.bytes)
  await writeFile(join(output,'generated-browser-verification.png'),verification)
  await save('real-generation-acceptance.json',{sourceCommit:commit,evaluationRequests:calls.length,modelProvider:'deepseek',configuredModel:'deepseek-flash',acceptanceScope:'single-static-Ada-generation-through-real-build-and-controlled-browser',generationAccepted:true,fullPlatformAcceptance:false,platformTestExitCode:exitCode,platformApiFixture:false,signingFixture:false,platformPreviewFailure:'IFRAME_LOAD_TIMEOUT_ROOT_CAUSE_UNKNOWN',task,completed,runner,screenshot:{path:'generated-browser-verification.png',digest:runner.verification.screenshot.digest,bytes:verification.length}})
 }
}
for(const [name,command] of [
 ['protocol-regression','services/api/mvnw.cmd -f services/api/pom.xml -Dtest=AgentLoopIntegrationTest#D09AT2_modelCannotForgeSuccessOrInvokeVerifyToolsInGenerate test'],
 ['ambiguous-browser','services/api/mvnw.cmd -f services/api/pom.xml -Dtest=AgentLoopIntegrationTest#ambiguousBrowserTargetsCannotPromoteEvenAfterARealSuccessfulBuild test'],
 ['registry-gateway','node --test tests/e2e/preview/registry.acceptance.mjs tests/e2e/preview/gateway.acceptance.mjs'],
 ['static','pnpm verify:static'],['ci-gate','pnpm ci:gate']
]){
 const exitCode=Number((await readFile(join(logs,name+'.exit'),'utf8')).trim()),log=await readFile(join(logs,name+'.log'))
 assert.equal(exitCode,0)
 commands.push({name,command,exitCode,logDigest:digest(log),logBytes:log.length,rawLog:name+'.log'})
}
await save('real-artifact-ui-diagnostic.json',JSON.parse(await readFile(join(logs,'real-artifact-ui-diagnostic.json'),'utf8')))
await save('reviewed-pr21-checks.json',JSON.parse(await readFile(join(logs,'pr21-checks.json'),'utf8')))
await save('D09-A-ambiguous-browser.json',JSON.parse(await readFile(join(target,'agent-integration/evidence/D09-A-ambiguous-browser.json'),'utf8')))
await save('commands.json',{reviewedIntegration:'2abc81ec95b54e39e6decc573f54fb94e39285fb',sourceCommit:execFileSync('git',['rev-parse','HEAD'],{cwd:checkout,encoding:'utf8'}).trim(),commands})
await save('runtime-usage.json',{current:{requests,knownUsageCalls:requests,unknownUsageCalls:0,inputTokens:input,outputTokens:completion,providerReportedTotal:total,measurement:'PROVIDER_RESPONSE_AND_SQL'},cumulative:{requests:14+requests,knownUsageCalls:12+requests,unknownUsageCalls:2,inputTokensKnown:22695+input,outputTokensKnown:6047+completion,providerReportedTotalKnown:28742+total,completeTotal:null,measurement:'UNKNOWN_COMPLETE_TOTAL_DUE_TO_TWO_HISTORICAL_UNKNOWN_CALLS'},developer:{inputTokens:null,outputTokens:null,totalTokens:null,measurement:'UNKNOWN'}})
console.log(JSON.stringify({requests,inputTokens:input,outputTokens:completion,providerReportedTotal:total,output}))
