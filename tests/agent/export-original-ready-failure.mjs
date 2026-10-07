import assert from 'node:assert/strict'
import {readFile,writeFile,mkdir,stat} from 'node:fs/promises'
import {join,resolve} from 'node:path'
import {execFileSync} from 'node:child_process'
import {readSnapshot,digest} from '../../services/runner/src/artifacts/snapshot.mjs'

// Only export fixed diagnostics from the preserved failed run, never a raw log or URL.
const [runtimeArg,logArg,exitArg]=process.argv.slice(2)
assert.ok(runtimeArg&&logArg&&exitArg,'runtime, original log and exit-file are required')
const checkout=resolve(import.meta.dirname,'../..'),runtime=resolve(runtimeArg)
const output=join(checkout,'tests/agent/evidence/2026-10-05/original-ready-restart')
const commit='f32fb3ffd9a0bb7deb53c560c764401a95aa5e6c'
const json=async path=>JSON.parse((await readFile(path,'utf8')).replace(/^\uFEFF/,''))
const log=await readFile(resolve(logArg)),text=new TextDecoder('utf-8',{fatal:true}).decode(log)
const commands=await json(join(checkout,'tests/agent/evidence/2026-10-05/platform/commands.json'))
const original=commands.commands.find(c=>c.name==='unique-targets')
assert.equal(original.commit,commit);assert.equal(digest(log),original.logDigest);assert.equal(log.length,original.logBytes)
assert.equal(Number((await readFile(resolve(exitArg),'utf8')).trim()),1)
const started=await json(join(runtime,'evidence/started.json')),task=await json(join(runtime,'evidence/task.json'))
assert.equal(task.id,'a6deca3a-6856-4b1e-b765-c486cd43e37a');assert.equal(started.taskId,task.id);assert.equal(task.status,'READY')
const calls=await json(join(runtime,'evidence/model-calls.json'))
assert.equal(calls.length,6)
for(const call of calls){assert.equal(call.provider,'deepseek');assert.equal(call.model,'deepseek-flash');assert.equal(call.status,'SUCCEEDED')}
const buffers=(await readSnapshot(join(runtime,'private/journal',task.id))).buffers
const events=[...buffers.values()].map(b=>JSON.parse(b.toString('utf8')))
const completed=events.findLast(e=>e.kind==='completion').payload,draft=events.findLast(e=>e.kind==='draft').payload,runner=events.findLast(e=>e.kind==='runner.result').payload
assert.equal(runner.status,'VERIFIED');assert.equal(runner.build.exitCode,0);assert.equal(runner.verification.status,'PASSED')
assert.equal((await readSnapshot(draft.sourceDirectory,{source:true})).manifest.digest,completed.sourceDigest)
assert.equal((await readSnapshot(runner.build.artifact.directory)).manifest.digest,completed.artifactDigest)
assert.deepEqual(await json(join(runtime,'private/receipts',runner.executionId+'.json')),runner)
assert.equal(completed.buildId,runner.build.id);assert.equal(completed.versionId,draft.versionId)
const source=execFileSync('git',['show',commit+':tests/e2e/preview/platform.acceptance.mjs'],{cwd:checkout,encoding:'utf8'})
const lines=source.split('\n')
assert.ok(lines[88].includes('page.screenshot'));assert.ok(lines[89].includes('assert.equal(issued.status,200)'))
assert.ok(lines[110].includes('assert.equal(runtime.registry.stats().mapped,1)'))
assert.ok(lines[112].includes('刷新预览')&&lines[112].includes('assert.equal((await refreshed).status(),200);await assertContent()'))
assert.ok(text.includes('platform.acceptance.mjs:113:118'))
assert.ok(text.includes("Locator: locator('iframe').contentFrame().locator('body')"))
assert.ok(text.includes('Expected substring: "Ada Lovelace"')&&text.includes('Timeout: 30000ms'))
assert.equal(Number(text.match(/(\d+) [^\n]*locator resolved to <body>/)?.[1]),33)
assert.ok(text.includes('502 Bad Gateway')&&text.includes('nginx/1.27.5'))
// The Java/Windows log already lost Chinese characters. Match the known UI text
// through the observed CP936 -> UTF-8 replacement conversion, without rewriting it.
const fixedAlert='页面未能在时限内加载，请刷新预览。'
const component=execFileSync('git',['show',commit+':apps/web/src/features/preview/PreviewPanel.vue'],{cwd:checkout,encoding:'utf8'})
assert.ok(component.includes(fixedAlert)&&component.includes('}, 15_000)'))
const lossyAlert=execFileSync('pwsh',['-NoProfile','-Command',"[Console]::Write([Text.Encoding]::UTF8.GetString([Text.Encoding]::GetEncoding(936).GetBytes('页面未能在时限内加载，请刷新预览。')))"],{encoding:'utf8'})
assert.ok(text.includes('- alert: '+lossyAlert))
const fault=await json(join(runtime,'evidence/ingress-log-rejection.json'))
assert.deepEqual(fault,{upstreamStopped:true,httpStatus:502,syntheticMarkerLogged:false})
const picturePath=join(runtime,'evidence/authenticated-platform-preview.png'),picture=await readFile(picturePath)
assert.equal(picture.subarray(0,8).toString('hex'),'89504e470d0a1a0a')
const pictureTime=(await stat(picturePath)).mtime.toISOString()
assert.ok(Date.parse(pictureTime)>Date.parse(task.updatedAt)&&Date.parse(pictureTime)<Date.parse('2026-10-04T16:40:20Z'))
const report={sourceCommit:commit,taskId:task.id,applicationId:task.applicationId,taskStatus:'READY',versionId:completed.versionId,buildId:completed.buildId,sourceDigest:completed.sourceDigest,artifactDigest:completed.artifactDigest,
  command:original.command,exitCode:1,fullPlatformAcceptance:false,modelProvider:'deepseek',configuredModel:'deepseek-flash',originalModelRequests:6,newModelRequests:0,
  failure:{phase:'REFRESH_AFTER_INTENTIONAL_GATEWAY_STOP_FAULT_PROBE_AND_RESTART',file:'tests/e2e/preview/platform.acceptance.mjs',line:113,matcher:'toContainText',locator:"locator('iframe').contentFrame().locator('body')",expectedSubstring:'Ada Lovelace',assertionTimeoutMs:30000,error:'ELEMENT_NOT_FOUND_AT_FINAL_ASSERTION',observedFrameBody:'502 Bad Gateway\nnginx/1.27.5',bodyResolvedPolls:33},
  initialPreview:{contentAssertionsPassed:['Ada Lovelace','Analytical Engine','Note G'],iframePresent:true,evidence:'PRECEDING_ASSERTIONS_AND_ORIGINAL_SCREENSHOT',isolationAssertionsPassed:true,screenshot:{path:'initial-authenticated-platform-preview.png',digest:digest(picture),bytes:picture.length,modifiedAt:pictureTime,scope:'BEFORE_FAULT_INJECTION'}},
  issuer:{explicitInitialRequest:{status:200,evidence:'PRECEDING_ASSERTION_LINE_90'},postRestartRefreshRequest:{status:200,evidence:'PRECEDING_ASSERTION_ON_FAILURE_LINE_113'},rawHttpTrace:'NOT_CAPTURED'},
  registry:{initialMapped:1,postRestartMapped:1,evidence:'PRECEDING_ASSERTIONS_LINES_99_AND_111',failureCounters:'NOT_CAPTURED'},
  previewHttp:{intentionalStoppedUpstreamProbe:fault,postRestartResponseStatus:'NOT_CAPTURED',postRestartBrowserBody:'502 Bad Gateway\nnginx/1.27.5'},
  ui:{iframePresentDuringFailedPolling:true,evidence:'PLAYWRIGHT_CONTENT_FRAME_BODY_RESOLVED_33_TIMES',finalDomIframeCount:'NOT_CAPTURED',finalTimeoutAlert:fixedAlert,alertEvidence:'ORIGINAL_ARIA_LOG_MATCHES_FIXED_UI_TEXT_AFTER_CP936_TO_UTF8_LOSSY_DECODE',componentLoadTimeoutMs:15000,componentTimeoutEvidence:'UNCHANGED_PREVIEW_PANEL_SOURCE',postFailureScreenshot:'NOT_CAPTURED'},
  loadedMessage:{origin:'NOT_CAPTURED',source:'NOT_CAPTURED',state:'NOT_CAPTURED'},safeNetworkDiagnostic:'NOT_CAPTURED_ORIGINAL_RUN_PREDATES_DIAGNOSTIC_COLLECTOR',upstreamRootCause:'UNKNOWN',
  rawLog:{shared:false,digest:digest(log),bytes:log.length,originalFailureUnmodified:true},credentialUrlShared:false,cookieOrHeadersShared:false,
  correction:'Original initial authenticated preview succeeded. The full test failed during refresh after gateway restart; earlier handoff omitted the pre-fault success and restart failure location.'}
const serialized=JSON.stringify(report,null,2)+'\n'
const key=process.env.CODELESS_MODEL_API_KEY
if(key)assert.ok(!serialized.includes(key))
await mkdir(output,{recursive:true});await writeFile(join(output,'initial-authenticated-platform-preview.png'),picture);await writeFile(join(output,'failure.json'),serialized)
console.log(JSON.stringify({output,originalLogDigestVerified:true,initialPreviewPassed:true,failedPhase:report.failure.phase,outerExitCode:1,fullPlatformAcceptance:false,newModelRequests:0}))
