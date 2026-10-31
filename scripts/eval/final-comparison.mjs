// Compare full REAL batches without rewriting either batch or changing the D21 ledger.
import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { buildReport } from './report.mjs'
import { verifyBatch } from './verify-batch.mjs'
import { canonical, sha256 } from './lib.mjs'

export function compareReports(baseline, candidate) {
  for (const report of [baseline, candidate]) {
    assert.equal(report.mode, 'REAL', 'mock is not model quality evidence')
    assert.equal(report.realModelEvidence, true, 'foreign provider calls invalidate evidence')
    assert.equal(report.requirements.denominator, 9)
    assert.equal(report.faults.code.denominator, 3)
    assert.equal(report.faults.environment.denominator, 2)
  }
  assert.deepEqual(candidate.frozen, baseline.frozen, 'frozen bytes changed')
  assert.deepEqual(candidate.provider, baseline.provider, 'provider/model differs from first round')
  assert.deepEqual(candidate.requirements.sampleIds, baseline.requirements.sampleIds, 'sample replacement or removal')
  const samples = report => [...report.requirements.samples, ...report.faults.results.map(row => row.sample)]
  const before = samples(baseline), after = samples(candidate)
  assert.deepEqual(after.map(row => row.sampleId), before.map(row => row.sampleId), 'fault replacement or removal')
  const view = row => ({ taskId: row.taskId, outcome: row.outcome, firstPass: row.firstPass, finalSuccess: row.finalSuccess,
    failure: row.failure, execution: row.execution, repairRounds: row.repairRounds, usage: row.usage,
    charged: row.charged, durationMs: row.durationMs, finalVersion: row.finalVersion })
  return { schemaVersion: 1, task: 'D25-A', baseline: { batchId: baseline.batchId, commit: baseline.platformCommit },
    candidate: { batchId: candidate.batchId, commit: candidate.platformCommit }, provider: candidate.provider, frozen: candidate.frozen,
    requirements: { denominator: 9, baseline: { firstPass: baseline.requirements.firstPass, finalSuccess: baseline.requirements.finalSuccess, failureTypes: baseline.requirements.failureTypes },
      candidate: { firstPass: candidate.requirements.firstPass, finalSuccess: candidate.requirements.finalSuccess, failureTypes: candidate.requirements.failureTypes },
      successCountDelta: candidate.requirements.finalSuccess.count - baseline.requirements.finalSuccess.count,
      target: candidate.requirements.target, behaviorAssertions: candidate.requirements.behaviorAssertions },
    faults: { baseline: { code: baseline.faults.code, environment: baseline.faults.environment },
      candidate: { code: candidate.faults.code, environment: candidate.faults.environment }, results: candidate.faults.results.map(row => ({ faultId: row.faultId, status: row.status, checks: row.checks })) },
    usage: { baseline: { requirements: baseline.requirements.usage, faults: baseline.faults.usage },
      candidate: { requirements: candidate.requirements.usage, faults: candidate.faults.usage } },
    samples: after.map((row, index) => ({ sampleId: row.sampleId, before: view(before[index]), after: view(row),
      transition: before[index].finalSuccess === row.finalSuccess ? 'UNCHANGED' : row.finalSuccess ? 'BECAME_READY' : 'REGRESSED' })),
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [baselineDir, candidateDir, output] = process.argv.slice(2)
  assert.ok(baselineDir && candidateDir && output, 'baseline candidate output required')
  const baseline = buildReport(baselineDir), candidate = buildReport(candidateDir)
  const result = compareReports(baseline, candidate)
  result.integrity = { baseline: verifyBatch(baselineDir), candidate: verifyBatch(candidateDir) }
  result.reportDigests = { baseline: sha256(readFileSync(join(baselineDir, 'report.json'))), candidate: sha256(readFileSync(join(candidateDir, 'report.json'))) }
  result.acceptance = { evidenceValid: result.integrity.baseline.ok && result.integrity.candidate.ok,
    platformTargetMet: candidate.requirements.target.met,
    faultsMet: candidate.faults.code.passed === 3 && candidate.faults.environment.passed === 2,
    requirementBehaviorStatus: 'PENDING_INDEPENDENT_REPLAY' }
  writeFileSync(output, canonical(result), { flag: 'wx' })
  console.log(canonical({ output, acceptance: result.acceptance, finalSuccess: candidate.requirements.finalSuccess }))
  process.exitCode = result.acceptance.evidenceValid && result.acceptance.platformTargetMet && result.acceptance.faultsMet ? 0 : 1
}
