import test from 'node:test'
import assert from 'node:assert/strict'
import { loadFrozen, plannedSamples } from '../../../scripts/eval/lib.mjs'
import { aggregateUsage, callUsage, faultResult, failureType, median, requirementSummary, sampleMetrics, usageLedger } from '../../../scripts/eval/ledger.mjs'
import { syntheticRecord } from './fixtures.mjs'

const samples = plannedSamples(loadFrozen())
const requirement = samples[0].requirement
const call = (input, output, status = 'SUCCEEDED') => ({ id: 'c', stage: 'PLAN', status, inputTokens: input, outputTokens: output })

test('T3: a call is KNOWN only when the provider reported both counts; a real 0 stays 0', () => {
  assert.equal(callUsage(call(0, 0)), 'KNOWN')
  assert.equal(callUsage(call(10, null, 'FAILED')), 'UNKNOWN')
  assert.equal(callUsage(call(null, null, 'FAILED')), 'UNKNOWN')
  assert.equal(callUsage(call(null, null, 'REQUESTED')), 'PENDING')
})

test('T3: one unknown call makes exact totals null instead of 0, and known sums stay lower bounds', () => {
  const ledger = usageLedger([call(100, 20), call(50, null, 'FAILED'), call(null, null, 'FAILED')])
  assert.deepEqual([ledger.calls, ledger.knownCalls, ledger.unknownCalls, ledger.complete], [3, 1, 2, false])
  assert.deepEqual([ledger.inputTokens, ledger.outputTokens, ledger.totalTokens], [null, null, null])
  assert.deepEqual([ledger.knownInputTokens, ledger.knownOutputTokens, ledger.knownTotalTokens], [100, 20, 120]) // the half-known 50 is not summed
  const exact = usageLedger([call(100, 20), call(0, 0)])
  assert.deepEqual([exact.complete, exact.totalTokens], [true, 120])
  assert.deepEqual([usageLedger([]).complete, usageLedger([]).totalTokens], [true, 0]) // no call really means no consumption
})

test('T3: a sample without a task record keeps the aggregate unknown even if every recorded call is known', () => {
  const recorded = { task: { id: 't' }, modelCalls: [call(10, 5)] }
  const ledger = aggregateUsage([recorded, null])
  assert.deepEqual([ledger.complete, ledger.totalTokens, ledger.knownTotalTokens, ledger.samplesWithoutTaskRecord], [false, null, 15, 1])
  assert.equal(aggregateUsage([recorded]).totalTokens, 15)
})

test('failure types keep model, code, budget and environment failures apart', () => {
  assert.equal(failureType('MODEL_NETWORK', {}, 'PLAN'), 'MODEL_TRANSPORT')
  assert.equal(failureType('AGENT_MODEL_PROTOCOL_INVALID', {}, 'GENERATE'), 'MODEL_OUTPUT')
  assert.equal(failureType('AGENT_REPAIR_LIMIT_EXCEEDED', {}, 'VERIFY'), 'CODE_NOT_REPAIRED')
  assert.equal(failureType('AGENT_MODEL_BUDGET_EXCEEDED', {}, 'GENERATE'), 'BUDGET')
  assert.equal(failureType('AGENT_RUNNER_UNAVAILABLE', {}, 'VERIFY'), 'ENVIRONMENT')
  const navigation = { journal: [{ kind: 'repair.failure', payload: { code: 'AGENT_NAVIGATION_TIMEOUT', category: 'INFRASTRUCTURE', decision: 'AGENT_NAVIGATION_TIMEOUT' } }] }
  assert.equal(failureType('AGENT_NAVIGATION_TIMEOUT', navigation, 'VERIFY'), 'ENVIRONMENT')
  assert.equal(failureType('AGENT_INTERNAL_ERROR', { injection: { status: 'HARNESS_ERROR' } }, 'GENERATE'), 'HARNESS')
  assert.equal(failureType('SOMETHING_NEW', {}, 'GENERATE'), 'UNCLASSIFIED')
})

test('first pass needs a verified first candidate; a repaired READY is final success but not first pass', () => {
  const first = sampleMetrics({ planned: samples[0], record: syntheticRecord({ sampleId: 'SHOW-01', batchId: 'b', requirement }) })
  assert.deepEqual([first.firstVerify, first.firstPass, first.finalSuccess, first.repairRounds, first.failure], ['VERIFIED', true, true, 0, null])
  const repaired = sampleMetrics({ planned: samples[0], record: syntheticRecord({ sampleId: 'SHOW-01', batchId: 'b', requirement,
    verifies: [{ code: 'AGENT_BUILD_EXIT', category: 'CODE', decision: 'REPAIR' }, 'VERIFIED'] }) })
  assert.deepEqual([repaired.firstVerify, repaired.firstPass, repaired.finalSuccess, repaired.repairRounds], ['FAILED', false, true, 1])
  assert.equal(repaired.durationMs, 60000)
  const missing = sampleMetrics({ planned: samples[0], record: null })
  assert.deepEqual([missing.outcome, missing.finalSuccess, missing.failure.type, missing.durationMs], ['MISSING', false, 'HARNESS', null])
})

test('a harness error never counts as success even when the task row says READY', () => {
  const record = { ...syntheticRecord({ sampleId: 'SHOW-01', batchId: 'b', requirement }), harnessError: { type: 'X', message: 'collect failed' } }
  const metrics = sampleMetrics({ planned: samples[0], record })
  assert.deepEqual([metrics.outcome, metrics.finalSuccess, metrics.failure.type], ['READY', false, 'HARNESS'])
})

test('T1: the requirement denominator stays 9 when records are missing; missing samples are failures', () => {
  const items = samples.filter((s) => s.kind === 'REQUIREMENT').map((s, index) => ({ planned: s,
    record: index === 4 ? null : syntheticRecord({ sampleId: s.id, batchId: 'b', requirement: s.requirement,
      ...(index === 2 ? { verifies: [{ code: 'AGENT_BUILD_EXIT', category: 'CODE', decision: 'AGENT_REPAIR_LIMIT_EXCEEDED' }],
        failure: { code: 'AGENT_REPAIR_LIMIT_EXCEEDED', stage: 'VERIFY' } } : {}) }) }))
  const summary = requirementSummary(items, ['SHOWCASE', 'TASKS', 'CATALOG'])
  assert.equal(summary.denominator, 9)
  assert.deepEqual(summary.missingRecords, ['TASK-02'])
  assert.deepEqual([summary.finalSuccess.count, summary.finalSuccess.rate], [7, 0.7778])
  assert.equal(summary.target.met, false)
  assert.equal(summary.taskIds['TASK-02'], null)
  assert.equal(Object.values(summary.taskIds).filter(Boolean).length, 8)
  assert.deepEqual([summary.failureTypes.CODE_NOT_REPAIRED, summary.failureTypes.HARNESS], [1, 1])
  assert.equal(summary.usage.complete, false) // the missing sample may have spent tokens
  assert.equal(summary.behaviorAssertions.requirementLevelFinalSuccess, null)
  assert.deepEqual([summary.byCategory.TASKS.denominator, summary.byCategory.TASKS.finalSuccess], [3, 2])
})

test('median and max durations use known samples only', () => {
  assert.equal(median([3, 1, 2]), 2)
  assert.equal(median([4, 1, 2, 3]), 3)
  assert.equal(median([]), null)
})

test('T2: a code fault passes only if it failed as CODE first and was repaired within 3 rounds with unchanged actions', () => {
  const fault = samples.find((s) => s.id === 'FAULT-CODE-01')
  const record = syntheticRecord({ sampleId: fault.id, batchId: 'b', requirement: fault.requirement,
    verifies: [{ code: 'AGENT_BUILD_EXIT', category: 'CODE', decision: 'REPAIR' }, 'VERIFIED'],
    injection: { status: 'APPLIED', origin: fault.fault.origin } })
  assert.equal(faultResult({ planned: fault, record }).status, 'PASSED')
  const unrepaired = syntheticRecord({ sampleId: fault.id, batchId: 'b', requirement: fault.requirement,
    verifies: [{ code: 'AGENT_BUILD_EXIT', category: 'CODE', decision: 'REPAIR' }, { code: 'AGENT_BUILD_EXIT', category: 'CODE', decision: 'REPAIR' },
      { code: 'AGENT_BUILD_EXIT', category: 'CODE', decision: 'REPAIR' }, { code: 'AGENT_BUILD_EXIT', category: 'CODE', decision: 'AGENT_REPAIR_LIMIT_EXCEEDED' }],
    failure: { code: 'AGENT_REPAIR_LIMIT_EXCEEDED', stage: 'VERIFY' }, injection: { status: 'APPLIED', origin: fault.fault.origin } })
  const failed = faultResult({ planned: fault, record: unrepaired })
  assert.equal(failed.status, 'FAILED')
  assert.deepEqual(failed.checks.filter((c) => !c.pass).map((c) => c.check), ['final'])
  const changed = syntheticRecord({ sampleId: fault.id, batchId: 'b', requirement: fault.requirement, actionsChange: true,
    verifies: [{ code: 'AGENT_BUILD_EXIT', category: 'CODE', decision: 'REPAIR' }, 'VERIFIED'], injection: { status: 'APPLIED', origin: fault.fault.origin } })
  assert.deepEqual(faultResult({ planned: fault, record: changed }).checks.filter((c) => !c.pass).map((c) => c.check), ['acceptance actions unchanged'])
})

test('T2: an environment fault fails if the platform sent it to REPAIR or changed code', () => {
  const fault = samples.find((s) => s.id === 'FAULT-ENV-01')
  const stopped = syntheticRecord({ sampleId: fault.id, batchId: 'b', requirement: fault.requirement, environment: { containerCliOnPath: false },
    verifies: [{ code: 'AGENT_RUNNER_UNAVAILABLE', category: 'INFRASTRUCTURE', decision: 'AGENT_RUNNER_UNAVAILABLE' }],
    failure: { code: 'AGENT_RUNNER_UNAVAILABLE', stage: 'VERIFY' } })
  assert.equal(faultResult({ planned: fault, record: stopped }).status, 'PASSED')
  const misrouted = syntheticRecord({ sampleId: fault.id, batchId: 'b', requirement: fault.requirement, environment: { containerCliOnPath: false },
    verifies: [{ code: 'AGENT_RUNNER_UNAVAILABLE', category: 'CODE', decision: 'REPAIR' }, { code: 'AGENT_RUNNER_UNAVAILABLE', category: 'INFRASTRUCTURE', decision: 'AGENT_RUNNER_UNAVAILABLE' }],
    failure: { code: 'AGENT_RUNNER_UNAVAILABLE', stage: 'VERIFY' } })
  const result = faultResult({ planned: fault, record: misrouted })
  assert.equal(result.status, 'FAILED')
  assert.deepEqual(result.checks.filter((c) => !c.pass).map((c) => c.check), ['no REPAIR decision', 'repair rounds', 'REPAIR model calls', 'immutable candidates'])
  const network = samples.find((s) => s.id === 'FAULT-ENV-02')
  const refused = syntheticRecord({ sampleId: network.id, batchId: 'b', requirement: network.requirement, plan: false, verifies: [],
    environment: { containerCliOnPath: true, proxyTcpProbe: 'REFUSED' }, calls: [{ stage: 'PLAN', error: 'MODEL_NETWORK' }],
    failure: { code: 'MODEL_NETWORK', stage: 'PLAN', category: 'MODEL_INTERFACE' } })
  assert.equal(faultResult({ planned: network, record: refused }).status, 'PASSED')
  const retried = syntheticRecord({ sampleId: network.id, batchId: 'b', requirement: network.requirement, plan: false, verifies: [],
    environment: { containerCliOnPath: true, proxyTcpProbe: 'REFUSED' }, calls: [{ stage: 'PLAN', error: 'MODEL_NETWORK' }, { stage: 'PLAN', error: 'MODEL_NETWORK' }],
    failure: { code: 'MODEL_NETWORK', stage: 'PLAN', category: 'MODEL_INTERFACE' } })
  assert.deepEqual(faultResult({ planned: network, record: retried }).checks.filter((c) => !c.pass).map((c) => c.check), ['model calls (no retry)'])
})
