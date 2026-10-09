import assert from 'node:assert/strict'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { resolve, relative, isAbsolute, join, sep } from 'node:path'
import { createHash } from 'node:crypto'
import { summarizeNetwork } from './diagnostic-observations.mjs'

// Only sanitized, fixed diagnostic inputs; historical evidence is referenced, never rewritten.
const root=resolve('tests/agent/repair/evidence')
assert.ok(process.argv[2],'Provide a new evidence directory; historical exports must not be overwritten')
const output=resolve(process.argv[2])
const location=relative(root,output)
assert.ok(location && !isAbsolute(location) && !location.startsWith('..'))
const digest=bytes=>'sha256:'+createHash('sha256').update(bytes).digest('hex')
const readJson=async path=>JSON.parse((await readFile(path,'utf8')).replace(/^\uFEFF/,''))
const input=resolve(process.argv[3]??'.local-data/d10-a'),privateRoot=resolve('.local-data/d10-a')
assert.ok(input===privateRoot||input.startsWith(privateRoot+sep))
const networkLog=await readFile(join(input,'network-current.log'))
const observations=networkLog.toString('utf8').replace(/^\uFEFF/,'').trim().split(/\r?\n/).map(line=>JSON.parse(line))
assert.equal(observations.filter(item=>item.kind==='transport').length,4)
assert.equal(observations[0].credentialsUsed,false)
assert.equal(observations[0].modelCalls,0)
const exitText=(await readFile(join(input,'network-current.exit'),'utf8')).trim()
const exitCode=/^-?\d+$/.test(exitText)&&Number.isSafeInteger(Number(exitText))?Number(exitText):null
const summary=summarizeNetwork(observations,exitCode),environment=observations[0]
const historical=[
  'tests/agent/repair/evidence/2026-10-07/followup.json',
  'tests/agent/repair/evidence/2026-10-07/D10-A-local-api-failure.json',
  'docs/evidence/D10/M1/57776370-dd0b-4ed7-9931-cf6ff55e9ec4/acceptance.json',
  'docs/evidence/D10/M1/291be524-7417-4b96-820f-a03f26ac6b85/acceptance.json',
]
const retained=[]
for(const path of historical)retained.push({path,digest:digest(await readFile(path))})
await mkdir(output,{recursive:true})
await writeFile(join(output,'diagnostics.json'),JSON.stringify({
  base:'7c3a502ce34db66c64b06d8dd21293e3b92ae05a',realModelCallsThisRevision:0,paidRepair:'PAUSED_BY_USER',
  developmentRegression:{scope:'HISTORICAL_PROTOCOL_HTTP_DEVELOPMENT_RUN; not the current gate verdict',firstCommand:'pnpm ci:gate',firstExitCode:1,apiTests:123,apiFailures:6,apiErrors:3,apiSkipped:0,
    cause:'Appending 857 bytes to each GENERATE policy pushed existing missing-usage fixtures over the conservative 50,000 token budget before their last proposal; later checkpoint errors were consequences of the failed prerequisite.',
    correction:'Compact the shared policy to 416 bytes. Keep real closed JSON examples and transport/application distinction, original strict parser and all assertions.',
    minimumReproduction:'mvnw -Dtest=AgentLoopIntegrationTest#D09AT1_mockProviderGeneratesMultipleFilesThroughRealDatabaseDockerAndBrowser test',
    unchangedLimits:{repairs:3,modelRequests:12,toolSlots:20,chargedTokens:50000,taskMinutes:12,outputTokensPerCall:4096}},
  network:{command:'java tests/agent/repair/NetworkEnvironmentProbe.java',exitCode,measurement:'PROVIDED_OBSERVATIONS_REPLAY; exporter does not execute network requests',observedAt:environment.at??null,
    logDigest:digest(networkLog),outerProcess:await readJson(join(input,'network-current-environment.json')),observations,summary,
    childEnvironment:{defaultSelectedProxy:environment.selectedProxy??null,defaultSelector:environment.defaultProxySelector??null,measurement:'OBSERVED_ENVIRONMENT_RECORD; missing fields remain UNKNOWN'},
    earlierA:{source:historical[0],dns:['198.18.0.19'],http2Status:401,http1ExceptionClasses:['ExecutionException','SSLHandshakeException','ValidatorException','SunCertPathBuilderException'],certificateChain:'NOT_CAPTURED',proxyConfiguration:'NOT_CAPTURED'},
    earlierB:{source:'docs/handoffs/D10-M1.md (reported; original private log unavailable here)',dns:['120.232.219.129','120.240.157.195'],fourUnauthenticatedStatuses:[401,401,401,401],certificateChain:'api.deepseek.com -> TrustAsia -> DigiCert; hashes NOT_CAPTURED'},
    historicalPaidNetworkFailureRootCause:'UNKNOWN',conclusion:summary.conclusion},
  http504:{taskId:'291be524-7417-4b96-820f-a03f26ac6b85',endpoint:'/api/v0/auth/csrf',observedStatus:504,rootCause:'UNKNOWN',
    browserCachedUpdatedAt:'2026-10-07T11:04:23.787885Z',journalCompletionAt:'2026-10-07T11:04:36.729790Z',requestStartAt:null,requestEndAt:null,
    serverLogs:'NOT_AVAILABLE_IN_THIS_WORKSPACE; .local-data/d10-m1 absent; historical nginx container absent before new regression',
    codeFacts:['GET csrf is public and bypasses account SQL lookup; handler uses HttpSession and a local random token, no model/queue operation.',
      'Platform nginx proxies to host.docker.internal API and sets proxy_read_timeout 600s. Access logging is disabled in the existing template.',
      'Opt-in CsrfTimingFilter logs exact endpoint start/finish/time/status, internally generated id; no cookies, tokens, bodies, headers or query values. Default is disabled.'],
    nextEvidence:['B browser request start/end and response metadata','API and nginx error logs covering request; upstream address; connecting vs reading response header','If API started but did not finish: contemporaneous thread/GC/socket observations'],
    regressionMeaning:'Current unpaid HTTP and platform regressions prove those runs only. Fewer CSRF requests and new timing logs do not explain or repair the historical 504.'},
  ownership:{windowsCleanup:{ownerRole:'D08-A file-tool / environment maintainer',rootCause:'UNKNOWN'},
    exit137OomFalse:{ownerRole:'D07-B runner / environment maintainer',rootCause:'UNKNOWN',exitCode:137,oomKilled:false},
    humanCoordination:'Requested through follow-up draft PR and PR #25; no ownership acceptance assumed.'},retainedHistoricalEvidence:retained,
  developmentTokens:{input:null,output:null,total:null,meteringSource:'UNKNOWN'},
},null,2)+'\n',{flag:'wx'})
console.log('Exported current diagnostics; historical causes remain UNKNOWN and paid repair remains paused')
