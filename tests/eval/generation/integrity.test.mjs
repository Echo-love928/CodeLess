// Counterexamples from the D21-B review of 6e707c0: P1, a READY task row counted although the sample JVM
// failed, timed out or left no result; P2, a failed call collection reported as an exact 0 tokens.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { loadFrozen, plannedSamples, root } from '../../../scripts/eval/lib.mjs'
import { aggregateUsage, execution, faultResult, requirementSummary, sampleMetrics, usageLedger } from '../../../scripts/eval/ledger.mjs'
import { writeReport } from '../../../scripts/eval/report.mjs'
import { verifyBatch } from '../../../scripts/eval/verify-batch.mjs'
import { CLEAN_EXIT, defaultRecord, syntheticBatch, syntheticRecord } from './fixtures.mjs'

const samples = plannedSamples(loadFrozen())
const planned = (id) => samples.find((s) => s.id === id)
const CATEGORIES = ['SHOWCASE', 'TASKS', 'CATALOG']
// The reviewer's repro reads the committed first real batch; the records are used unchanged.
const BATCH = join(root, 'evals/generation/runs/2026-10-23T14-16-43Z-real-545bbebf/samples')
const raw = (id, name) => JSON.parse(readFileSync(join(BATCH, id, name), 'utf8'))
const failed = (result) => result.checks.filter((c) => !c.pass).map((c) => c.id)
const failing = (result) => result.checks.filter((c) => !c.pass).map((c) => c.check)

test('P1 repro: the unchanged real SHOW-01 record never counts after a failed, timed-out or missing JVM result', () => {
  const record = raw('SHOW-01', 'record.json')
  const counted = sampleMetrics({ planned: planned('SHOW-01'), record, invocation: raw('SHOW-01', 'invocation-result.json') })
  assert.deepEqual([counted.execution, counted.firstPass, counted.finalSuccess, counted.failure], ['OK', true, true, null])
  for (const [invocation, status] of [[{ exitCode: 1, timedOut: false }, 'NONZERO_EXIT'], [{ exitCode: null, timedOut: true }, 'TIMED_OUT'],
    [undefined, 'RESULT_MISSING']]) {
    const metrics = sampleMetrics({ planned: planned('SHOW-01'), record, invocation })
    assert.deepEqual([metrics.outcome, metrics.execution, metrics.firstPass, metrics.finalSuccess, metrics.failure?.type],
      ['READY', status, false, false, 'HARNESS'], status)
  }
})

test('P1: only a JVM that ran to the end by itself with exit 0 is OK; anything malformed is not', () => {
  assert.equal(execution(CLEAN_EXIT), 'OK')
  assert.equal(execution({ ...CLEAN_EXIT, exitCode: 1 }), 'NONZERO_EXIT')
  assert.equal(execution({ ...CLEAN_EXIT, exitCode: null, timedOut: true }), 'TIMED_OUT')
  assert.equal(execution({ ...CLEAN_EXIT, exitCode: null, signal: 'SIGKILL' }), 'KILLED_BY_SIGNAL')
  assert.equal(execution({ ...CLEAN_EXIT, exitCode: null, launchError: 'spawn ENOENT' }), 'LAUNCH_ERROR')
  assert.equal(execution({ exitCode: 0 }), 'RESULT_INVALID') // timedOut not recorded: no proof of a clean finish
  assert.equal(execution(null), 'RESULT_MISSING')
})

test('P1: a failed process lowers the summary, and a platform FAILED keeps its own failure category', () => {
  const items = samples.filter((s) => s.kind === 'REQUIREMENT').map((s) => ({ planned: s,
    invocation: ['CAT-01', 'TASK-03'].includes(s.id) ? { ...CLEAN_EXIT, exitCode: 1 } : CLEAN_EXIT,
    record: syntheticRecord({ sampleId: s.id, batchId: 'b', requirement: s.requirement,
      ...(s.id === 'TASK-03' ? { verifies: [], failure: { code: 'MODEL_NETWORK', stage: 'PLAN' } } : {}) }) }))
  const summary = requirementSummary(items, CATEGORIES)
  assert.deepEqual([summary.firstPass.count, summary.finalSuccess.count], [7, 7])
  assert.deepEqual(summary.executionFailures, [{ sampleId: 'TASK-03', execution: 'NONZERO_EXIT' }, { sampleId: 'CAT-01', execution: 'NONZERO_EXIT' }])
  assert.deepEqual([summary.failureTypes.HARNESS, summary.failureTypes.MODEL_TRANSPORT], [1, 1])
})

test('P1: every fault result needs a clean JVM exit and no harness error before its own expectations count', () => {
  const fault = planned('FAULT-CODE-01')
  const record = syntheticRecord({ sampleId: fault.id, batchId: 'b', requirement: fault.requirement,
    verifies: [{ code: 'AGENT_BUILD_EXIT', category: 'CODE', decision: 'REPAIR' }, 'VERIFIED'], injection: { status: 'APPLIED', origin: fault.fault.origin } })
  assert.deepEqual(failing(faultResult({ planned: fault, invocation: CLEAN_EXIT, record })), [])
  assert.deepEqual(failing(faultResult({ planned: fault, invocation: { ...CLEAN_EXIT, exitCode: 1 }, record })), ['sample JVM exit', 'final'])
  assert.deepEqual(failing(faultResult({ planned: fault, invocation: CLEAN_EXIT, record: { ...record, harnessError: { type: 'X', message: 'collect failed' } } })),
    ['harness error', 'final'])
  const network = planned('FAULT-ENV-02')
  const refused = syntheticRecord({ sampleId: network.id, batchId: 'b', requirement: network.requirement, plan: false, verifies: [],
    environment: { containerCliOnPath: true, proxyTcpProbe: 'REFUSED' }, calls: [{ stage: 'PLAN', error: 'MODEL_NETWORK' }],
    failure: { code: 'MODEL_NETWORK', stage: 'PLAN', category: 'MODEL_INTERFACE' } })
  const timedOut = faultResult({ planned: network, invocation: { ...CLEAN_EXIT, exitCode: null, timedOut: true }, record: refused })
  assert.deepEqual([timedOut.status, failing(timedOut)], ['FAILED', ['sample JVM exit']])
  assert.equal(faultResult({ planned: network, record: refused }).status, 'FAILED') // no process result at all
})

test('P1: a failed sample JVM is a valid failed sample; a report or process result rewritten afterwards is caught', (t) => {
  const { dir, parent, repo } = syntheticBatch({ invocations: { 'SHOW-03': { exitCode: 1 } } })
  t.after(() => rmSync(parent, { recursive: true, force: true }))
  const r = writeReport(dir).requirements
  assert.deepEqual([r.firstPass.count, r.finalSuccess.count, r.executionFailures], [8, 8, [{ sampleId: 'SHOW-03', execution: 'NONZERO_EXIT' }]])
  const markdown = readFileSync(join(dir, 'report.md'), 'utf8')
  assert.match(markdown, /样本进程异常（不计成功）：SHOW-03 NONZERO_EXIT/)
  assert.match(markdown, /\| SHOW-03 \| SHOWCASE \| [0-9a-f-]+ \| VERIFIED \| READY（不计成功） \| 0 \| HARNESS \/ — \|/)
  assert.deepEqual(failed(verifyBatch(dir, { repositoryRoot: repo })), [])
  const reportPath = join(dir, 'report.json')
  const honest = readFileSync(reportPath, 'utf8')
  const claimed = JSON.parse(honest)
  Object.assign(claimed.requirements.samples.find((s) => s.sampleId === 'SHOW-03'), { firstPass: true, finalSuccess: true, failure: null })
  writeFileSync(reportPath, JSON.stringify(claimed, null, 2) + '\n')
  assert.deepEqual(failed(verifyBatch(dir, { repositoryRoot: repo })),
    ['SHOW-03: success claimed only after a clean process exit', 'report equals recomputation from raw records'])
  writeFileSync(reportPath, honest)
  const resultPath = join(dir, 'samples/SHOW-03/invocation-result.json')
  writeFileSync(resultPath, JSON.stringify({ ...JSON.parse(readFileSync(resultPath, 'utf8')), exitCode: 0 }, null, 2) + '\n')
  assert.deepEqual(failed(verifyBatch(dir, { repositoryRoot: repo })),
    ['SHOW-03: process result matches the append-only event log', 'report equals recomputation from raw records'])
  writeReport(dir) // even a regenerated report cannot hide the rewrite: the event log disagrees
  assert.deepEqual(failed(verifyBatch(dir, { repositoryRoot: repo })), ['SHOW-03: process result matches the append-only event log'])
})

test('P1: a record that appeared after its process finished without one is rejected', (t) => {
  const { dir, parent, repo } = syntheticBatch({ invocations: { 'TASK-02': { recordPresent: false } } })
  t.after(() => rmSync(parent, { recursive: true, force: true }))
  writeReport(dir)
  assert.deepEqual(failed(verifyBatch(dir, { repositoryRoot: repo })), ['TASK-02: record presence matches the process result'])
})

test('P2 repro: the real SHOW-01 record without its call rows keeps usage unknown per sample and in aggregate', () => {
  const record = raw('SHOW-01', 'record.json')
  delete record.modelCalls
  record.harnessError = { type: 'org.springframework.dao.DataAccessResourceFailureException', message: 'model_calls query failed' }
  const usage = aggregateUsage([record])
  assert.deepEqual([usage.complete, usage.totalTokens, usage.inputTokens, usage.knownTotalTokens, usage.samplesWithoutCallRecord],
    [false, null, null, 0, 1])
  const metrics = sampleMetrics({ planned: planned('SHOW-01'), record, invocation: { ...CLEAN_EXIT, exitCode: 1 } })
  assert.deepEqual([metrics.usage.callRecord, metrics.usage.complete, metrics.usage.totalTokens, metrics.usage.calls, metrics.usage.unknownCalls],
    ['MISSING', false, null, null, null])
  assert.deepEqual([metrics.modelCalls.total, metrics.modelCalls.byStage, metrics.cache.cacheHitInputTokens, metrics.finalSuccess], [null, null, null, false])
  // Control: a recorded empty list is a real zero, an absent one is not.
  assert.deepEqual([usageLedger([]).callRecord, usageLedger([]).complete, usageLedger([]).totalTokens], ['RECORDED', true, 0])
  assert.deepEqual([usageLedger(undefined).callRecord, usageLedger(undefined).complete, usageLedger(undefined).totalTokens], ['MISSING', false, null])
})

test('P2: a failed call collection keeps the batch report unknown and still verifies as a failed sample', (t) => {
  const collectionFailed = (sample, batchId, mode) => {
    const record = defaultRecord(sample, batchId, mode)
    delete record.modelCalls
    return { ...record, harnessError: { type: 'org.springframework.dao.DataAccessResourceFailureException', message: 'model_calls query failed' } }
  }
  const { dir, parent, repo } = syntheticBatch({ overrides: { 'SHOW-02': collectionFailed }, invocations: { 'SHOW-02': { exitCode: 1 } } })
  t.after(() => rmSync(parent, { recursive: true, force: true }))
  const r = writeReport(dir).requirements
  assert.deepEqual([r.usage.complete, r.usage.totalTokens, r.usage.samplesWithoutCallRecord, r.modelCalls], [false, null, 1, null])
  const sample = r.samples.find((s) => s.sampleId === 'SHOW-02')
  assert.deepEqual([sample.usage.callRecord, sample.finalSuccess, sample.failure.type], ['MISSING', false, 'HARNESS'])
  const markdown = readFileSync(join(dir, 'report.md'), 'utf8')
  assert.match(markdown, /1 个样本无调用记录/)
  assert.match(markdown, /\| SHOW-02 \|[^\n]*\| 未知 \| 未知（无调用记录） \|/)
  assert.deepEqual(failed(verifyBatch(dir, { repositoryRoot: repo })), [])
})

test('P2: an unreadable journal leaves charges, tool slots and first verification unknown instead of 0', () => {
  const show = planned('SHOW-02')
  const record = { ...syntheticRecord({ sampleId: show.id, batchId: 'b', requirement: show.requirement }), journal: [], journalError: 'journal unreadable' }
  const metrics = sampleMetrics({ planned: show, record, invocation: CLEAN_EXIT })
  assert.deepEqual([metrics.charged.chargedTokens, metrics.charged.estimatedCalls, metrics.toolSlots, metrics.firstVerify, metrics.verifyRuns, metrics.drafts],
    [null, null, null, 'UNKNOWN', null, null])
  assert.deepEqual([metrics.finalSuccess, metrics.firstPass, metrics.usage.complete], [true, false, true]) // the task and call rows stay known
  const items = samples.filter((s) => s.kind === 'REQUIREMENT').map((s) => ({ planned: s, invocation: CLEAN_EXIT,
    record: s.id === show.id ? record : syntheticRecord({ sampleId: s.id, batchId: 'b', requirement: s.requirement }) }))
  const summary = requirementSummary(items, CATEGORIES)
  assert.deepEqual([summary.charged.chargedTokens, summary.charged.samplesWithoutJournal, summary.toolSlots, summary.modelCalls], [null, 1, null, 18])
  const env = planned('FAULT-ENV-01')
  const blind = { ...syntheticRecord({ sampleId: env.id, batchId: 'b', requirement: env.requirement, environment: { containerCliOnPath: false },
    verifies: [{ code: 'AGENT_RUNNER_UNAVAILABLE', category: 'INFRASTRUCTURE', decision: 'AGENT_RUNNER_UNAVAILABLE' }],
    failure: { code: 'AGENT_RUNNER_UNAVAILABLE', stage: 'VERIFY' } }), journal: [], journalError: 'journal unreadable' }
  const result = faultResult({ planned: env, invocation: CLEAN_EXIT, record: blind })
  assert.equal(result.status, 'FAILED') // "no REPAIR" and "no tool calls" are unknown without a journal, never vacuously true
  assert.deepEqual(failing(result), ['journal and model calls recorded', 'failure stage', 'failure category', 'no REPAIR decision',
    'immutable candidates', 'file tool calls after failure'])
})
