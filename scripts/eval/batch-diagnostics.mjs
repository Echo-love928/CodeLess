// Partial evidence is diagnostic only. Strict final-metrics and verify-batch remain mandatory and unchanged.
import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { buildReport, loadBatch } from './report.mjs'
import { verifyBatch } from './verify-batch.mjs'
import { joinBehavior } from './final-metrics.mjs'
import { aggregateUsage } from './ledger.mjs'
import { canonical, sha256 } from './lib.mjs'

export function batchDiagnostics(batchPath, behaviorPath) {
  const loaded = loadBatch(batchPath), report = buildReport(batchPath)
  assert.equal(readFileSync(join(resolve(batchPath), 'report.json'), 'utf8'), canonical(report), 'Original report must equal recomputation')
  const bytes = readFileSync(behaviorPath), behavior = JSON.parse(bytes)
  const joined = joinBehavior(report, behavior), integrity = verifyBatch(batchPath)
  const processes = loaded.items.map(item => ({ sampleId: item.planned.id, recordPresent: !!item.record,
    exitCode: item.invocation?.exitCode ?? null, launchError: item.invocation?.launchError ?? null,
    timedOut: item.invocation?.timedOut ?? null }))
  const usage = aggregateUsage(loaded.items.map(item => item.record))
  return { kind: 'DIAGNOSTICS_ONLY_NOT_FINAL_ACCEPTANCE', batchId: report.batchId, candidate: report.platformCommit,
    frozen: report.frozen, provider: report.provider,
    originalStructuralCompletion: report.completion,
    execution: { planned: processes.length, records: processes.filter(row => row.recordPresent).length,
      completedExitZero: processes.filter(row => row.exitCode === 0 && !row.launchError && row.timedOut === false).length,
      refusedBeforeJvm: processes.filter(row => row.launchError === 'CNY_BUDGET_NOT_STARTED' && !row.recordPresent).length, processes },
    integrity: { ok: integrity.ok, passed: integrity.checks.filter(c => c.pass).length, total: integrity.checks.length,
      failures: integrity.checks.filter(c => !c.pass) },
    firstPass: report.requirements.firstPass, platformReady: report.requirements.finalSuccess,
    requirementBehavior: { ...joined, author: 'A_SELF_CHECK_NOT_B_INDEPENDENT_ACCEPTANCE' },
    faults: { code: report.faults.code, environment: report.faults.environment },
    runtimeUsage: usage, behaviorAdditionalModelRequests: behavior.additionalModelRequests,
    inputs: { originalReport: sha256(readFileSync(join(resolve(batchPath), 'report.json'))), behaviorReport: sha256(bytes), ...report.inputs },
    qualityStatus: 'HOLD', finalizationAllowed: false,
    limitation: 'Preserves all fixed denominators and original refusal. Does not waive failed integrity, finalize an incomplete batch, replace the original report, accept a supplement, or establish B editing/public evidence.' }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [batch, behavior, output, flag] = process.argv.slice(2)
  assert.ok(batch && behavior && output)
  const result = batchDiagnostics(batch, behavior), bytes = canonical(result)
  if (flag === '--check') assert.equal(readFileSync(output, 'utf8'), bytes)
  else writeFileSync(output, bytes, { flag: 'wx' })
  console.log(JSON.stringify({ output, check: flag === '--check', status: result.qualityStatus,
    execution: result.execution.records + '/' + result.execution.planned, requirementBehavior: result.requirementBehavior.passed + '/9',
    integrity: result.integrity.ok, runtimeUsage: result.runtimeUsage }))
  process.exitCode = flag === '--check' ? 0 : 1
}
