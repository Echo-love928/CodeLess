// Overlay independently rebuilt requirement behavior; never rewrite platform READY or original reports.
import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { buildReport, loadBatch } from './report.mjs'
import { aggregateUsage } from './ledger.mjs'
import { canonical, sha256 } from './lib.mjs'

export function joinBehavior(platform, behavior) {
  assert.equal(platform.mode, 'REAL'); assert.equal(platform.realModelEvidence, true)
  assert.equal(behavior.mode, 'REAL'); assert.equal(behavior.batchId, platform.batchId)
  assert.ok(behavior.completedAt && ['PASSED', 'FAILED'].includes(behavior.status), 'behavior must have terminated')
  assert.equal(behavior.additionalModelRequests, 0)
  assert.deepEqual(behavior.rows.map(row => row.sampleId), platform.requirements.sampleIds)
  const rows = platform.requirements.samples.map((sample, index) => {
    const row = behavior.rows[index]
    assert.equal(row.taskId, sample.taskId)
    assert.equal(row.rawDigest, platform.inputs['samples/' + sample.sampleId + '/record.json'])
    assert.ok(typeof row.passed === 'boolean', 'unexecuted behavior remains unknown, not successful')
    if (row.passed) {
      assert.equal(sample.finalSuccess, true, 'failed platform sample cannot pass behavior')
      assert.equal(row.versionId, sample.finalVersion.id); assert.equal(row.sourceDigest, sample.finalVersion.sourceDigest)
      assert.equal(row.originalVerification.status, 'PASSED')
      assert.equal(row.build.status, 'SUCCEEDED'); assert.equal(row.build.exitCode, 0)
      assert.equal(row.browser.status, 'PASSED')
    }
    return { sampleId: sample.sampleId, taskId: sample.taskId, platformReady: sample.finalSuccess,
      behaviorPassed: row.passed, finalSuccess: sample.finalSuccess && row.passed, failure: row.failure,
      versionId: row.versionId, sourceDigest: row.sourceDigest }
  })
  const passed = rows.filter(row => row.finalSuccess).length
  return { denominator: 9, passed, failed: 9 - passed, rate: Math.round(passed / 9 * 10000) / 10000,
    target: 8, targetMet: passed >= 8, rows }
}

export function finalMetrics(batchDir, behaviorPath) {
  const platform = buildReport(batchDir), bytes = readFileSync(behaviorPath), behavior = JSON.parse(bytes)
  const combined = joinBehavior(platform, behavior), { items } = loadBatch(batchDir)
  return { schemaVersion: 1, task: 'D25-A', batchId: platform.batchId, evaluatedCommit: platform.platformCommit,
    frozen: platform.frozen, provider: platform.provider, firstPass: platform.requirements.firstPass,
    platformFinal: platform.requirements.finalSuccess, requirementFinal: combined,
    faults: { code: platform.faults.code, environment: platform.faults.environment },
    allRuntimeUsage: aggregateUsage(items.map(item => item.record)),
    runtimeCharges: [...platform.requirements.samples, ...platform.faults.results.map(row => row.sample)]
      .reduce((sum, row) => sum === null || row.charged.chargedTokens === null ? null : sum + row.charged.chargedTokens, 0),
    behaviorReportSha256: sha256(bytes), ledgerInputs: platform.inputs,
    qualityStatus: combined.targetMet && platform.faults.code.passed === 3 && platform.faults.environment.passed === 2 ? 'PASSED' : 'HOLD',
    note: 'Original platform report retains PENDING_D21_B. Requirement-level result is joined here by task, version, source and raw-record digests.' }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [batch, behavior, output, flag] = process.argv.slice(2)
  const result = finalMetrics(batch, behavior), bytes = canonical(result)
  if (flag === '--check') assert.equal(readFileSync(output, 'utf8'), bytes, 'final metrics differ from raw recomputation')
  else writeFileSync(output, bytes, { flag: 'wx' })
  console.log(JSON.stringify({ output, check: flag === '--check', status: result.qualityStatus,
    requirementFinal: result.requirementFinal.passed + '/9', codeFaults: result.faults.code.passed + '/3' }))
  process.exitCode = flag === '--check' || result.qualityStatus === 'PASSED' ? 0 : 1
}
