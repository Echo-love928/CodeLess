// Export only fixed, session-free counters from the original A combination log; never rerun it.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { createHash } from 'node:crypto'
import assert from 'node:assert/strict'

const root = resolve(import.meta.dirname,'../../..'), mode = process.argv[2] ?? 'capture'
assert.ok(['capture','check'].includes(mode)); assert.ok(process.argv.length <= 3)
const sha = bytes => 'sha256:'+createHash('sha256').update(bytes).digest('hex')
const stage = 'tests/regression/release-api/evidence/2026-10-31T13-00-43.124Z-e2e/'
const privateLog = '.local-data/d26-a/commands/2026-10-31T13-00-43.124Z-e2e/command.log'
const reportBytes = readFileSync(join(root,stage,'command.json')), report = JSON.parse(reportBytes)
assert.equal(report.head,'3a0d7869b2ed1a381b3033b857da8e806d251c77')
assert.equal(report.privateLog,privateLog)
assert.equal(report.exitCode,0); assert.equal(report.signal,null); assert.equal(report.launchError,null)
assert.equal(report.sourceBytesUnchanged,true); assert.equal(report.headUnchanged,true)
assert.equal(report.diagnosticProcessObserver,false)
const log = readFileSync(join(root,privateLog))
assert.equal(log.length,39107); assert.equal(log.length,report.logBytes)
assert.equal(sha(log),'sha256:a25e5afd126d6dd4d87375d51d1ddd3554d97c525acbaa92547655ce1f20afbd')
assert.equal(sha(log),report.logSha256)
const fullBytes = readFileSync(join(root,stage,'full-product.json')), full = JSON.parse(fullBytes)
assert.equal(full.revision,report.head); assert.equal(full.status,'PASSED'); assert.equal(full.browserExitCode,0)
assert.equal(full.browserSignal,null); assert.equal(full.retries,0)
assert.equal(full.canonical,false); assert.equal(full.publicAcceptance,false)
assert.deepEqual(full.changedSources,[]); assert.deepEqual(full.cleanupErrors,[])
const counts = [...log.toString('utf8').matchAll(/^([ \t]*80 passed \([\d.]+m\))\r?$/gm)]
assert.equal(counts.length,1,'Require exactly the original 80-case Playwright completion line')
const parts = [
  { kind:'PLAYWRIGHT_COMPLETION_LINE', bytes:Buffer.from(counts[0][1]) },
  { kind:'FULL_PRODUCT_TERMINAL_FIELDS_ONLY', bytes:Buffer.from('"status":"PASSED","browserExitCode":0') },
]
let excerptOffset = 0
const fragments = parts.map(part => {
  const start = log.indexOf(part.bytes)
  assert.ok(start >= 0); assert.equal(log.indexOf(part.bytes,start+1),-1)
  const entry = { kind:part.kind, originalByteStart:start, originalByteEndExclusive:start+part.bytes.length,
    excerptByteStart:excerptOffset, excerptByteEndExclusive:excerptOffset+part.bytes.length, sha256:sha(part.bytes) }
  excerptOffset += part.bytes.length+1
  return entry
})
assert.ok(fragments[1].originalByteStart > fragments[0].originalByteEndExclusive)
const excerpt = Buffer.concat(parts.flatMap(p => [p.bytes,Buffer.from('\n')]))
const metadata = { task:'D26-A-REVIEW-FOLLOWUP',classification:'A_ORIGINAL_COMBINATION_LOG_EXCERPT',
  independentlyRerunByB:false,newE2eRun:false,originalReport:stage+'command.json',originalReportSha256:sha(reportBytes),
  originalHead:report.head,originalStartedAt:report.startedAt,originalCompletedAt:report.completedAt,
  originalLog:privateLog,originalLogSha256:sha(log),originalLogBytes:log.length,originalOuterExitCode:report.exitCode,
  observedPlaywrightPassed:80,observedFullProductStatus:'PASSED',observedBrowserExitCode:0,
  fullProductSeparateProcessExitCode:null,fullProductSeparateProcessExitNote:'Not separately recorded; retain the original outer and browser exits without inventing another native value',
  fullProductReport:stage+'full-product.json',fullProductReportSha256:sha(fullBytes),
  canonical:full.canonical,publicAcceptance:full.publicAcceptance,modelProvider:full.modelProvider,
  paidModelRequests:0,realModelQuality:'NOT_EVALUATED',
  exportPolicy:'Only the exact count line and exact status/browserExitCode substring; no sessions, SQL, paths or other log lines',
  excerptSha256:sha(excerpt),excerptBytes:excerpt.length,fragments,
  historicalReportsUnchanged:true,BRemote75Cases:'SEPARATE_HEAD_D4D250F_NOT_THIS_80_CASE_COMBINATION' }
const output = join(import.meta.dirname,'evidence/review-2026-11-01')
const textPath = join(output,'combination-e2e-counts.txt'), jsonPath = join(output,'combination-e2e-counts.json')
if (mode === 'capture') {
  assert.ok(!existsSync(textPath) && !existsSync(jsonPath),'Preserve prior artifacts; use check to verify an existing excerpt')
  mkdirSync(output,{recursive:true})
  writeFileSync(textPath,excerpt,{flag:'wx'}); writeFileSync(jsonPath,JSON.stringify(metadata,null,2)+'\n',{flag:'wx'})
} else {
  assert.deepEqual(readFileSync(textPath),excerpt)
  assert.deepEqual(JSON.parse(readFileSync(jsonPath)),metadata)
}
console.log(JSON.stringify({mode,status:'PASSED',sourceLogSha256:sha(log),sourceLogBytes:log.length,
  excerptSha256:sha(excerpt),excerptBytes:excerpt.length,playwrightPassed:80,outerExitCode:report.exitCode,browserExitCode:0,
  originalReportsUnchanged:true,newE2eRun:false}))
