// Recompute separate supplement evidence. Never finalizes or repairs the original incomplete batch.
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { loadBatch, buildReport } from './report.mjs'
import { faultSummary, aggregateUsage } from './ledger.mjs'
import { joinBehavior } from './final-metrics.mjs'
import { CANDIDATE } from './budgeted-batch.mjs'
import { sha256, canonical } from './lib.mjs'
const read = path => JSON.parse(readFileSync(path, 'utf8'))
const [batchPath, supplementPath, behaviorPath, output, flag] = process.argv.slice(2)
assert.ok(batchPath && supplementPath && behaviorPath && output)
const batch = resolve(batchPath), supplement = resolve(supplementPath), loaded = loadBatch(batch)
assert.equal(loaded.batch.git.head, CANDIDATE); assert.equal(loaded.batch.mode, 'REAL')
const summary = read(join(supplement, 'summary.json')), raw = read(join(supplement, 'record.json'))
const spec = read(join(supplement, 'spec.json')), invocation = read(join(supplement, 'invocation-result.json'))
assert.equal(summary.originalBatchId, loaded.batch.batchId); assert.equal(summary.candidate, CANDIDATE)
assert.equal(summary.kind, 'SEPARATE_FIRST_ACTUAL_JVM'); assert.equal(summary.retries, 0)
assert.equal(summary.originalBatchUnchanged, true); assert.equal(summary.originalBatchStillIncomplete, true)
assert.equal(summary.acceptedByB, null)
const permit = read(join(supplement, 'invocation.json')), hashes = {}
function visit(directory, prefix = '') {
  for (const e of readdirSync(directory, { withFileTypes: true })) {
    assert.ok(!e.isSymbolicLink()); const path = prefix + e.name
    if (e.isDirectory()) visit(join(directory, e.name), path + '/')
    else hashes[path] = sha256(readFileSync(join(directory, e.name)))
  }
}
visit(batch); assert.deepEqual(hashes, permit.originalDigests)
const original = loaded.items.find(row => row.planned.id === 'FAULT-ENV-02')
assert.equal(original.invocation.launchError, 'CNY_BUDGET_NOT_STARTED'); assert.equal(original.record, null)
assert.equal(spec.sampleId, original.planned.id); assert.equal(spec.batchId, loaded.batch.batchId)
assert.equal(sha256(readFileSync(join(supplement, 'spec.json'))), sha256(readFileSync(join(batch, 'samples/FAULT-ENV-02/spec.json'))))
const recalculated = faultSummary([{ planned: original.planned, spec, invocation, record: raw }])
assert.deepEqual(recalculated, summary.faults)
const actualOriginal = loaded.items.filter(row => row !== original)
assert.equal(actualOriginal.length, 13)
assert.ok(actualOriginal.every(row => row.record && row.invocation.exitCode === 0 && !row.invocation.launchError))
const report = buildReport(batch), behavior = joinBehavior(report, read(behaviorPath))
const result = { kind: 'SEPARATE_SUPPLEMENT_DIAGNOSTICS_NOT_ORIGINAL_BATCH_FINALIZATION',
  candidate: CANDIDATE, originalBatchId: loaded.batch.batchId,
  originalBatch: { execution: '13/14', originalRefusalPreserved: true, allOriginalBytesUnchanged: true, complete: false,
    faults: { code: report.faults.code, environment: report.faults.environment } },
  supplement: { sampleId: spec.sampleId, firstActualJvm: true, nativeExitCode: invocation.exitCode,
    status: recalculated.results[0].status, acceptedByB: null, countsTowardOriginalSuccess: false, checks: recalculated.results[0].checks },
  originalPositionsActuallyExecutedOnce: 14, extraRetries: 0,
  platformReady: report.requirements.finalSuccess, aSelfBehavior: { ...behavior, independentB: false },
  actualJvmUsage: aggregateUsage([...actualOriginal.map(row => row.record), raw]),
  fee: summary.fee, qualityStatus: 'HOLD', originalFinalizationAllowed: false,
  evidence: { originalReport: sha256(readFileSync(join(batch, 'report.json'))), supplementRecord: sha256(readFileSync(join(supplement, 'record.json'))),
    supplementSummary: sha256(readFileSync(join(supplement, 'summary.json'))), behaviorReport: sha256(readFileSync(behaviorPath)) },
  notice: 'Fourteen original positions each executed once across the original partial batch and an explicitly authorized separate first JVM. B decides supplement acceptance independently; original 9/3/2 denominators, refusal and failed integrity are unchanged.' }
const bytes = canonical(result)
if (flag === '--check') assert.equal(readFileSync(output, 'utf8'), bytes)
else writeFileSync(output, bytes, { flag: 'wx' })
console.log(JSON.stringify({ output, check: flag === '--check', status: 'HOLD', originalBatchStillIncomplete: true,
  positionsActuallyExecutedOnce: 14, supplement: result.supplement.status, acceptedByB: null,
  usage: result.actualJvmUsage, combinedUpperCny: result.fee.combinedUpperCny }))
process.exitCode = flag === '--check' ? 0 : 1
