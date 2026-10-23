// Pure D21-A metrics over raw sample records. No I/O: the same records always give the same numbers.
// Usage follows contracts/admin (D17-A): only provider-reported counts are actual tokens; a finished
// call with any missing count is UNKNOWN and makes exact totals null. Unknown is never written as 0.

const MODEL_TRANSPORT = new Set(['MODEL_NETWORK', 'MODEL_TIMEOUT', 'MODEL_UNAVAILABLE', 'MODEL_RATE_LIMITED',
  'MODEL_AUTHENTICATION', 'MODEL_HTTP_ERROR', 'MODEL_INTERRUPTED'])
const MODEL_OUTPUT = new Set(['MODEL_INVALID_RESPONSE', 'MODEL_RESPONSE_LIMIT', 'MODEL_INVALID_USAGE',
  'AGENT_MODEL_PROTOCOL_INVALID', 'PLAN_INVALID', 'PLAN_DATA_MODE', 'PLAN_UNSUPPORTED_REQUEST', 'AGENT_TOOL_NOT_ALLOWED',
  'AGENT_UNPLANNED_FILE', 'AGENT_ACCEPTANCE_INVALID', 'AGENT_ACCEPTANCE_INCOMPLETE', 'AGENT_PLAN_FILES_MISMATCH',
  'AGENT_REPAIR_ACCEPTANCE_CHANGED', 'FILE_NOT_FOUND', 'FILE_ALREADY_EXISTS', 'FILE_DIGEST_CONFLICT', 'FILE_PATH_REJECTED',
  'FILE_PATH_CONFLICT', 'FILE_SIZE_LIMIT', 'FILE_TOTAL_LIMIT', 'FILE_COUNT_LIMIT', 'FILE_INPUT_INVALID',
  'FILE_ENCODING_INVALID', 'FILE_SOURCE_EMPTY', 'FILE_LINK_REJECTED', 'FILE_TOOL_UNKNOWN'])
const BUDGET = new Set(['AGENT_MODEL_BUDGET_EXCEEDED', 'MODEL_BUDGET_EXCEEDED', 'MODEL_BUDGET_UNKNOWN',
  'AGENT_TOOL_BUDGET_EXCEEDED', 'FILE_CALL_LIMIT', 'AGENT_RUNNER_TIMEOUT', 'INTERRUPTED', 'STAGE_LIMIT'])
const CODE_NOT_REPAIRED = new Set(['AGENT_REPAIR_LIMIT_EXCEEDED', 'AGENT_REPAIR_NO_PROGRESS'])
const ENVIRONMENT = new Set(['AGENT_RUNNER_UNAVAILABLE', 'AGENT_RUNNER_INTERRUPTED', 'AGENT_RUNNER_RESULT_INVALID',
  'AGENT_RUNNER_RESULT_LIMIT', 'AGENT_RUNNER_RECEIPT_MISMATCH', 'AGENT_RUNNER_EVIDENCE_INVALID', 'AGENT_BUILD_EVIDENCE_INVALID',
  'AGENT_BROWSER_EVIDENCE_INVALID', 'AGENT_BROWSER_RECEIPT_MISMATCH', 'AGENT_SCREENSHOT_DIGEST_MISMATCH',
  'AGENT_ARTIFACT_DIGEST_MISMATCH', 'AGENT_SOURCE_DIGEST_MISMATCH', 'AGENT_MANIFEST_MISMATCH', 'AGENT_RECOVERY_REQUIRED',
  'AGENT_EVIDENCE_LIMIT', 'AGENT_PATH_REJECTED', 'AGENT_CONFIGURATION', 'FILE_IO_ERROR', 'FILE_AUDIT_UNAVAILABLE',
  'FILE_RECORD_UNAVAILABLE', 'FILE_TRANSACTION_CONTEXT_INVALID', 'FILE_LEASE_INVALID', 'FILE_TASK_UNAVAILABLE',
  'FILE_CONTEXT_INVALID', 'FILE_SOURCE_CHANGED', 'FILE_INTERNAL_ERROR', 'MODEL_AUDIT_UNAVAILABLE', 'MODEL_CONFIGURATION',
  'MODEL_RECORD_CONFLICT', 'MODEL_LEASE_INVALID', 'MODEL_TASK_UNAVAILABLE', 'MODEL_CALL_IN_PROGRESS', 'MODEL_INTERNAL_ERROR',
  'MODEL_INVALID_INPUT', 'RUNNER_ERROR', 'INVALID_STAGE_RESULT'])
export const FAILURE_TYPES = Object.freeze(['MODEL_TRANSPORT', 'MODEL_OUTPUT', 'CODE_NOT_REPAIRED', 'BUDGET',
  'ENVIRONMENT', 'CANCELLED', 'HARNESS', 'UNCLASSIFIED'])

const journal = (record, kind) => (record?.journal ?? []).filter((event) => event.kind === kind)
const payloads = (record, kind) => journal(record, kind).map((event) => event.payload)
const last = (values) => (values.length ? values[values.length - 1] : null)
const millis = (text) => (typeof text === 'string' && !Number.isNaN(Date.parse(text)) ? Date.parse(text) : null)
export const rate = (count, denominator) => (denominator > 0 ? Math.round((count / denominator) * 10000) / 10000 : null)

export function callUsage(call) {
  if (call.status === 'REQUESTED') return 'PENDING'
  return Number.isInteger(call.inputTokens) && Number.isInteger(call.outputTokens) ? 'KNOWN' : 'UNKNOWN'
}

/** D17-A口径: exact totals only when every call is KNOWN; known* are lower bounds otherwise. */
export function usageLedger(calls) {
  const ledger = { calls: calls.length, knownCalls: 0, unknownCalls: 0, pendingCalls: 0,
    knownInputTokens: 0, knownOutputTokens: 0, knownTotalTokens: 0 }
  for (const call of calls) {
    const usage = callUsage(call)
    if (usage === 'KNOWN') {
      ledger.knownCalls++
      ledger.knownInputTokens += call.inputTokens
      ledger.knownOutputTokens += call.outputTokens
    } else if (usage === 'UNKNOWN') ledger.unknownCalls++
    else ledger.pendingCalls++
  }
  ledger.knownTotalTokens = ledger.knownInputTokens + ledger.knownOutputTokens
  ledger.complete = ledger.knownCalls === ledger.calls
  ledger.inputTokens = ledger.complete ? ledger.knownInputTokens : null
  ledger.outputTokens = ledger.complete ? ledger.knownOutputTokens : null
  ledger.totalTokens = ledger.complete ? ledger.knownTotalTokens : null
  return ledger
}

/** Provider cache hits are a subset of input tokens: reported, never added a second time. */
export function cacheHits(record) {
  const known = new Set((record?.modelCalls ?? []).filter((call) => callUsage(call) === 'KNOWN').map((call) => call.id))
  let total = 0
  let reported = 0
  for (const audit of record?.modelAudit ?? []) {
    if (!known.has(audit.callId)) continue
    const value = audit.usage?.raw?.prompt_cache_hit_tokens
    if (Number.isInteger(value)) { total += value; reported++ }
  }
  return { knownCalls: known.size, reportedCalls: reported, cacheHitInputTokens: reported === known.size ? total : null }
}

/** Runtime budget charges, including conservative reservations for unknown usage. Never actual usage. */
export function charges(record) {
  const values = payloads(record, 'model.usage')
  return { calls: values.length, chargedTokens: values.reduce((sum, value) => sum + (value.chargedTokens ?? 0), 0),
    estimatedCalls: values.filter((value) => value.estimated === true).length }
}

export function toolSlots(record) {
  return payloads(record, 'tool.request').reduce((sum, value) => sum + (Number.isInteger(value?.slots) ? value.slots : 1), 0)
}

export function failureType(code, record, stage) {
  if (!code) return null
  if (record?.injection?.status === 'HARNESS_ERROR') return 'HARNESS'
  if (CODE_NOT_REPAIRED.has(code)) return 'CODE_NOT_REPAIRED'
  if (MODEL_TRANSPORT.has(code)) return 'MODEL_TRANSPORT'
  if (MODEL_OUTPUT.has(code)) return 'MODEL_OUTPUT'
  if (BUDGET.has(code)) return 'BUDGET'
  if (code === 'CANCELLED') return 'CANCELLED'
  if (ENVIRONMENT.has(code) || code.startsWith('AGENT_CHECKPOINT_')) return 'ENVIRONMENT'
  // VERIFY failures keep the platform's own RepairController category; the evaluation does not reclassify them.
  const verify = last(payloads(record, 'repair.failure'))
  if (stage === 'VERIFY' && verify?.decision === code && verify.category === 'INFRASTRUCTURE') return 'ENVIRONMENT'
  return 'UNCLASSIFIED'
}

export function sampleMetrics({ planned, record, invocation }) {
  const base = { sampleId: planned.id, kind: planned.kind, category: planned.category,
    baseRequirement: planned.fault ? planned.fault.baseRequirement : null }
  const exit = invocation ? { exitCode: invocation.exitCode ?? null, timedOut: invocation.timedOut === true } : null
  if (!record || !record.task) {
    return { ...base, outcome: record ? 'HARNESS_ERROR' : 'MISSING', recordPresent: Boolean(record), invocation: exit,
      harnessError: record?.harnessError ?? null, taskId: null, applicationId: null, firstVerify: 'NONE', firstPass: false,
      finalSuccess: false, repairRounds: null, verifyRuns: 0, drafts: 0, failure: { code: null, stage: null,
        platformCategory: null, verifyFailure: null, type: 'HARNESS' }, usage: usageLedger([]), cache: cacheHits(null),
      charged: charges(null), modelCalls: { total: 0, byStage: {} }, toolSlots: 0, durationMs: null,
      harnessWallClockMs: record?.harness?.wallClockMs ?? null, finalVersion: null, plan: null, lastVerification: null,
      providers: [], injection: null, environment: record?.harness?.environment ?? null }
  }
  const task = record.task
  const runner = payloads(record, 'runner.result')
  const repairFailures = payloads(record, 'repair.failure')
  const failureEvent = last(journal(record, 'failure'))
  const status = task.status
  const outcome = status === 'READY' ? 'READY' : status === 'FAILED' ? 'FAILED' : 'NOT_TERMINAL'
  const harnessError = record.harnessError ?? null
  const finalSuccess = outcome === 'READY' && !harnessError
  const firstVerify = runner.length ? (runner[0].status === 'VERIFIED' ? 'VERIFIED' : 'FAILED') : 'NONE'
  const terminal = last((record.taskEvents ?? []).filter((event) => ['TASK_FAILED', 'STAGE_COMPLETED'].includes(event.type)
    && (event.type === 'TASK_FAILED' || String(event.message ?? '').startsWith('PREVIEW_READY'))))
  const created = millis(task.createdAt)
  const ended = terminal ? millis(terminal.occurredAt) : null
  const stage = failureEvent?.stage ?? null
  const code = outcome === 'FAILED' ? task.failureCode : null
  const byStage = {}
  for (const call of record.modelCalls ?? []) byStage[call.stage] = (byStage[call.stage] ?? 0) + 1
  const ready = (record.versions ?? []).find((version) => version.id === record.application?.latestReadyVersionId)
  const finalVersion = ready ?? last(record.versions ?? [])
  const plan = last(payloads(record, 'plan'))
  const lastRunner = last(runner)
  const shot = lastRunner && (record.screenshots ?? []).find((s) => s.verificationId === lastRunner.verification?.id)
  return { ...base, outcome, recordPresent: true, invocation: exit, harnessError,
    taskId: task.id, applicationId: task.applicationId,
    firstVerify, firstPass: firstVerify === 'VERIFIED' && finalSuccess && task.repairAttempts === 0,
    finalSuccess, repairRounds: task.repairAttempts, verifyRuns: runner.length,
    drafts: payloads(record, 'draft').length,
    failure: outcome === 'READY' && !harnessError ? null : {
      code, stage, platformCategory: failureEvent?.payload?.category ?? null,
      verifyFailure: last(repairFailures)?.code ?? null,
      type: harnessError && outcome !== 'FAILED' ? 'HARNESS' : failureType(code, record, stage) ?? 'UNCLASSIFIED' },
    usage: usageLedger(record.modelCalls ?? []), cache: cacheHits(record), charged: charges(record),
    modelCalls: { total: (record.modelCalls ?? []).length, byStage }, toolSlots: toolSlots(record),
    durationMs: created !== null && ended !== null ? ended - created : null,
    harnessWallClockMs: record.harness?.wallClockMs ?? null,
    finalVersion: finalVersion ? { id: finalVersion.id, number: finalVersion.number, status: finalVersion.status,
      sourceDigest: finalVersion.sourceDigest,
      sourceDirectory: (record.sources ?? []).find((s) => s.versionId === finalVersion.id)?.directory ?? null } : null,
    plan: plan ? { dataMode: plan.dataMode, pages: (plan.pages ?? []).map((p) => ({ route: p.route, file: p.file, title: p.title })),
      files: (plan.files ?? []).map((f) => f.path) } : null,
    lastVerification: lastRunner ? { status: lastRunner.status, buildStatus: lastRunner.build?.status ?? null,
      buildExitCode: lastRunner.build?.exitCode ?? null, buildFailure: lastRunner.build?.failure ?? lastRunner.failure ?? null,
      verificationStatus: lastRunner.verification?.status ?? null, verificationFailure: lastRunner.verification?.failure ?? null,
      screenshot: shot?.path ?? null } : null,
    providers: [...new Set((record.modelCalls ?? []).map((call) => call.provider + '/' + call.model))].sort(),
    injection: record.injection ? { faultId: record.injection.faultId, status: record.injection.status, target: record.injection.target,
      strategy: record.injection.strategy ?? null, origin: record.injection.origin } : null,
    environment: record.harness?.environment ?? null }
}

export function median(values) {
  if (!values.length) return null
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[middle] : Math.round((sorted[middle - 1] + sorted[middle]) / 2)
}

/** A sample without a task record may still have spent tokens, so it keeps the aggregate incomplete. */
export function aggregateUsage(records) {
  const usage = usageLedger(records.flatMap((record) => record?.modelCalls ?? []))
  usage.samplesWithoutTaskRecord = records.filter((record) => !record?.task).length
  if (usage.samplesWithoutTaskRecord > 0) {
    usage.complete = false
    usage.inputTokens = null
    usage.outputTokens = null
    usage.totalTokens = null
  }
  return usage
}

function aggregate(samples, records) {
  const durations = samples.map((s) => s.durationMs).filter((value) => Number.isInteger(value))
  const types = Object.fromEntries(FAILURE_TYPES.map((type) => [type, 0]))
  for (const sample of samples) if (sample.failure) types[sample.failure.type]++
  const cache = records.map((record) => cacheHits(record))
  return {
    failureTypes: types,
    repairs: { totalRounds: samples.reduce((sum, s) => sum + (s.repairRounds ?? 0), 0),
      samplesWithRepairs: samples.filter((s) => (s.repairRounds ?? 0) > 0).length,
      unknownSamples: samples.filter((s) => s.repairRounds === null).length },
    usage: aggregateUsage(records),
    cacheHitInputTokens: cache.every((c) => c.cacheHitInputTokens !== null) ? cache.reduce((sum, c) => sum + c.cacheHitInputTokens, 0) : null,
    charged: { chargedTokens: samples.reduce((sum, s) => sum + s.charged.chargedTokens, 0),
      estimatedCalls: samples.reduce((sum, s) => sum + s.charged.estimatedCalls, 0) },
    modelCalls: samples.reduce((sum, s) => sum + s.modelCalls.total, 0),
    toolSlots: samples.reduce((sum, s) => sum + s.toolSlots, 0),
    duration: { knownSamples: durations.length, unknownSamples: samples.length - durations.length,
      medianMs: median(durations), maxMs: durations.length ? Math.max(...durations) : null }
  }
}

/** Requirement summary. The denominator is the frozen plan, never the set of records that happen to exist. */
export function requirementSummary(items, categories) {
  const samples = items.map(sampleMetrics)
  const denominator = items.length
  const count = (predicate) => samples.filter(predicate).length
  const byCategory = {}
  for (const category of categories) {
    const group = samples.filter((s) => s.category === category)
    byCategory[category] = { denominator: group.length, sampleIds: group.map((s) => s.sampleId),
      firstPass: group.filter((s) => s.firstPass).length, finalSuccess: group.filter((s) => s.finalSuccess).length }
  }
  const final = count((s) => s.finalSuccess)
  return {
    denominator, sampleIds: samples.map((s) => s.sampleId),
    taskIds: Object.fromEntries(samples.map((s) => [s.sampleId, s.taskId])),
    missingRecords: samples.filter((s) => !s.recordPresent).map((s) => s.sampleId),
    harnessErrors: samples.filter((s) => s.harnessError).map((s) => s.sampleId),
    firstPass: { count: count((s) => s.firstPass), rate: rate(count((s) => s.firstPass), denominator) },
    finalSuccess: { count: final, rate: rate(final, denominator) },
    notTerminal: count((s) => s.outcome === 'NOT_TERMINAL'),
    byCategory,
    behaviorAssertions: { status: 'PENDING_D21_B', requirementLevelFinalSuccess: null,
      note: 'Platform READY is counted above. D21-B behaviour assertions may only lower requirement-level success; until they run it is unknown, not success.' },
    target: { finalSuccessAtLeast: 8, of: 9, met: final >= 8, kind: 'BASELINE_TARGET_NOT_A_CLAIM' },
    ...aggregate(samples, items.map((item) => item.record)),
    samples
  }
}

function check(name, expected, actual) {
  return { check: name, expected, actual, pass: JSON.stringify(expected) === JSON.stringify(actual) }
}
function atMost(name, limit, actual) {
  return { check: name, expected: '<= ' + limit, actual, pass: Number.isInteger(actual) && actual <= limit }
}
function between(name, low, high, actual) {
  return { check: name, expected: low + '..' + high, actual, pass: Number.isInteger(actual) && actual >= low && actual <= high }
}

/** A fault sample passes only if every frozen expectation is observed in its raw record. */
export function faultResult(item) {
  const sample = sampleMetrics(item)
  const { record } = item
  const fault = item.planned.fault
  const checks = []
  if (!record?.task) {
    checks.push(check('record present with task', true, false))
  } else if (fault.class === 'CODE') {
    const drafts = payloads(record, 'draft')
    const firstRepair = payloads(record, 'repair.failure')[0] ?? null
    checks.push(check('injection applied', 'APPLIED', record.injection?.status ?? null))
    checks.push(check('injection labelled', fault.origin, record.injection?.origin ?? null))
    checks.push(check('first verify', 'FAILED', sample.firstVerify))
    checks.push(check('first failure category', 'CODE', firstRepair?.category ?? null))
    checks.push(check('first decision', 'REPAIR', firstRepair?.decision ?? null))
    checks.push(check('final', 'READY', sample.finalSuccess ? 'READY' : sample.outcome))
    checks.push(between('repair rounds', 1, fault.expected.maxRepairRounds, sample.repairRounds))
    checks.push(check('acceptance actions unchanged', true,
      drafts.length > 0 && drafts.every((draft) => JSON.stringify(draft.actions) === JSON.stringify(drafts[0].actions))))
    checks.push(check('final source differs from injected source', true,
      drafts.length > 1 && drafts[0].sourceDigest !== drafts[drafts.length - 1].sourceDigest))
  } else if (fault.injection === 'CONTAINER_CLI_UNAVAILABLE') {
    const verify = payloads(record, 'repair.failure')
    const after = (record.journal ?? []).filter((event) => event.kind === 'tool.result' && ['VERIFY', 'REPAIR'].includes(event.stage))
    checks.push(check('container CLI absent in sample JVM', false, record.harness?.environment?.containerCliOnPath ?? null))
    checks.push(check('final', 'FAILED', sample.outcome))
    checks.push(check('failure stage', 'VERIFY', sample.failure?.stage ?? null))
    checks.push(check('failure category', fault.expected.failureCategory, last(verify)?.category ?? sample.failure?.platformCategory ?? null))
    checks.push(check('no REPAIR decision', true, verify.every((value) => value.decision !== 'REPAIR')))
    checks.push(check('repair rounds', 0, sample.repairRounds))
    checks.push(check('REPAIR model calls', 0, sample.modelCalls.byStage.REPAIR ?? 0))
    checks.push(check('immutable candidates', 1, sample.drafts))
    checks.push(check('file tool calls after failure', 0, after.length))
  } else if (fault.injection === 'MODEL_ENDPOINT_UNREACHABLE') {
    const calls = record.modelCalls ?? []
    checks.push(check('proxy route refused before task', 'REFUSED', record.harness?.environment?.proxyTcpProbe ?? null))
    checks.push(check('final', 'FAILED', sample.outcome))
    checks.push(check('failure code', fault.expected.failureCode, sample.failure?.code ?? null))
    checks.push(check('failure category', fault.expected.failureCategory, sample.failure?.platformCategory ?? null))
    checks.push(check('model calls (no retry)', fault.expected.modelCalls, calls.length))
    checks.push(check('failed call usage', 'UNKNOWN', calls.length ? callUsage(calls[0]) : null))
    checks.push(check('file tool calls', 0, journal(record, 'tool.result').length))
    checks.push(check('repair rounds', 0, sample.repairRounds))
  } else {
    checks.push(check('known fault injection', 'CODE|CONTAINER_CLI_UNAVAILABLE|MODEL_ENDPOINT_UNREACHABLE', fault.injection))
  }
  return { faultId: fault.id, class: fault.class, injection: fault.injection, baseRequirement: fault.baseRequirement,
    status: !record ? 'MISSING' : checks.every((c) => c.pass) ? 'PASSED' : 'FAILED', checks, sample }
}

export function faultSummary(items) {
  const results = items.map(faultResult)
  const group = (cls) => {
    const members = results.filter((r) => r.class === cls)
    return { denominator: members.length, passed: members.filter((r) => r.status === 'PASSED').length,
      faultIds: members.map((r) => r.faultId) }
  }
  return { code: group('CODE'), environment: group('ENVIRONMENT'),
    usage: aggregateUsage(items.map((item) => item.record)), results }
}

/** Cross-checks between the evaluation's own arithmetic and the platform's journal meter. */
export function consistency(items) {
  const notes = []
  for (const item of items) {
    const record = item.record
    if (!record?.task || !record.platformMeter) continue
    const own = { models: journal(record, 'model.request').length, tools: toolSlots(record), chargedTokens: charges(record).chargedTokens }
    for (const key of ['models', 'tools', 'chargedTokens']) {
      if (own[key] !== record.platformMeter[key]) notes.push({ sampleId: item.planned.id, field: key, evaluation: own[key], platform: record.platformMeter[key] })
    }
    if (journal(record, 'model.request').length !== (record.modelCalls ?? []).length)
      notes.push({ sampleId: item.planned.id, field: 'modelCallsVsJournal', evaluation: journal(record, 'model.request').length, platform: (record.modelCalls ?? []).length })
  }
  return notes
}
