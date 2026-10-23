// Synthetic raw records for deterministic D21-A tests. They exist only in temp directories,
// are labelled SYNTHETIC_UNIT_TEST and never enter evals/generation/runs or any real statistic.
import { copyFileSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { FROZEN, canonical, loadFrozen, plannedSamples, root, sha256 } from '../../../scripts/eval/lib.mjs'

let counter = 0
export const uuid = () => '00000000-0000-4000-8000-' + String(++counter).padStart(12, '0')
const ACTIONS = [{ type: 'navigate', path: '/' }, { type: 'expectText', target: { testId: 'title' }, value: 'Fixture' }]

/**
 * verifies: e.g. ['VERIFIED'] or [{ code: 'AGENT_BUILD_EXIT', category: 'CODE', decision: 'REPAIR' }, 'VERIFIED'].
 * failure: { code, stage } for a FAILED task; calls: [{ stage, input, output, status, error }].
 */
export function syntheticRecord({ sampleId, batchId, mode = 'REAL', provider = 'deepseek', model = 'deepseek-flash', requirement,
  verifies = ['VERIFIED'], failure = null, calls = null, injection = null, environment = { containerCliOnPath: true },
  durationMs = 60000, cacheHits = null, plan = true, actionsChange = false }) {
  const taskId = uuid()
  const applicationId = uuid()
  const created = Date.parse('2026-10-23T00:00:00.000Z')
  const journal = []
  let sequence = 0
  const at = () => new Date(created + ++sequence * 100).toISOString()
  const event = (stage, kind, payload) => journal.push({ sequence: sequence + 1, taskId, stage, kind, payload, at: at() })
  const modelCalls = []
  const modelAudit = []
  const callList = calls ?? [{ stage: 'PLAN', input: 1000, output: 200 }, { stage: 'GENERATE', input: 3000, output: 900 },
    ...verifies.slice(1).map(() => ({ stage: 'REPAIR', input: 4000, output: 700 }))]
  for (const call of callList) {
    const id = uuid()
    const status = call.status ?? (call.error ? 'FAILED' : 'SUCCEEDED')
    event(call.stage, 'model.request', { reservedTokens: 8000 })
    modelCalls.push({ id, stage: call.stage, provider, model, status, inputTokens: call.input ?? null,
      outputTokens: call.output ?? null, errorCode: call.error ?? null, createdAt: new Date(created).toISOString(), completedAt: new Date(created).toISOString() })
    const known = Number.isInteger(call.input) && Number.isInteger(call.output)
    const charged = known ? call.input + call.output : (call.input ?? 3000) + (call.output ?? 4096)
    event(call.stage, 'model.usage', { usage: { inputTokens: call.input ?? null, outputTokens: call.output ?? null }, chargedTokens: charged,
      releasedTokens: 8000 - charged, reservationTokens: 8000, estimated: !known, meteringSource: known ? 'PROVIDER_USAGE' : 'UTF8_BYTES_PLUS_FRAMING_AND_MAX_OUTPUT' })
    modelAudit.push({ callId: id, usage: { inputTokens: call.input ?? null, outputTokens: call.output ?? null,
      raw: cacheHits === null ? {} : { prompt_cache_hit_tokens: cacheHits } } })
  }
  if (plan) event('PLAN', 'plan', { dataMode: requirement.dataMode, pages: [{ route: '/', file: 'src/pages/HomePage.vue', title: 'Fixture' }],
    files: [{ path: 'src/pages/HomePage.vue' }] })
  const versions = []
  verifies.forEach((verify, index) => {
    event('GENERATE', 'tool.request', { slots: 1 })
    const versionId = uuid()
    const digest = 'sha256:' + String(index).repeat(64).slice(0, 64)
    event('GENERATE', 'draft', { versionId, sourceDigest: digest, files: [], actions: actionsChange && index ? [...ACTIONS, { type: 'reload' }] : ACTIONS })
    event('VERIFY', 'tool.request', { slots: 2 })
    const passed = verify === 'VERIFIED'
    event('VERIFY', 'runner.result', { status: passed ? 'VERIFIED' : 'FAILED', build: { status: passed ? 'SUCCEEDED' : 'FAILED', exitCode: passed ? 0 : 2 },
      verification: passed ? { id: uuid(), status: 'PASSED', failure: null } : null })
    if (!passed) event('VERIFY', 'repair.failure', { code: verify.code, category: verify.category, decision: verify.decision })
    versions.push({ id: versionId, number: index + 1, sourceDigest: digest, status: passed ? 'VERIFIED' : 'FAILED' })
  })
  const ready = !failure && verifies[verifies.length - 1] === 'VERIFIED'
  if (failure) event(failure.stage, 'failure', { code: failure.code, category: failure.category ?? 'INFRASTRUCTURE' })
  const taskEvents = [{ id: uuid(), sequence: 1, type: 'STAGE_STARTED', stage: 'PLAN', message: 'Task accepted in PLAN', occurredAt: new Date(created).toISOString() },
    { id: uuid(), sequence: 2, type: ready ? 'STAGE_COMPLETED' : 'TASK_FAILED', stage: ready ? 'READY' : 'FAILED',
      message: ready ? 'PREVIEW_READY versionId=' + versions[versions.length - 1].id : 'Generation stopped', occurredAt: new Date(created + durationMs).toISOString() }]
  const meter = { models: modelCalls.length, tools: journal.filter((e) => e.kind === 'tool.request').reduce((n, e) => n + e.payload.slots, 0),
    chargedTokens: journal.filter((e) => e.kind === 'model.usage').reduce((n, e) => n + e.payload.chargedTokens, 0) }
  return { schemaVersion: 1, fixture: 'SYNTHETIC_UNIT_TEST', sampleId, kind: 'REQUIREMENT', batchId, mode, attempt: 1,
    harness: { wallClockMs: durationMs + 5000, environment, provider: { id: provider, model } },
    injection, application: { id: applicationId, name: requirement.applicationName, dataMode: requirement.dataMode,
      latestReadyVersionId: ready ? versions[versions.length - 1].id : null },
    task: { id: taskId, applicationId, prompt: requirement.prompt, status: ready ? 'READY' : failure ? 'FAILED' : 'VERIFY',
      repairAttempts: Math.max(0, verifies.length - 1), failureCode: failure?.code ?? null, createdAt: new Date(created).toISOString() },
    taskEvents, versions, builds: [], modelCalls, modelAudit, journal, platformMeter: meter, sources: [], screenshots: [], harnessError: null }
}

/** Default synthetic outcome per frozen sample: every expectation met. */
export function defaultRecord(sample, batchId, mode) {
  const base = { sampleId: sample.id, batchId, mode, requirement: sample.requirement,
    provider: mode === 'REAL' ? 'deepseek' : 'deterministic-mock', model: mode === 'REAL' ? 'deepseek-flash' : 'plan-fixture-v1' }
  if (sample.kind === 'REQUIREMENT') return { ...syntheticRecord(base), kind: sample.kind }
  if (sample.kind === 'CODE_FAULT') {
    return { ...syntheticRecord({ ...base, verifies: [{ code: 'AGENT_BUILD_EXIT', category: 'CODE', decision: 'REPAIR' }, 'VERIFIED'],
      injection: { faultId: sample.id, status: 'APPLIED', origin: sample.fault.origin, target: 'src/pages/HomePage.vue' } }), kind: sample.kind }
  }
  if (sample.fault.injection === 'CONTAINER_CLI_UNAVAILABLE') {
    return { ...syntheticRecord({ ...base, environment: { containerCliOnPath: false },
      verifies: [{ code: 'AGENT_RUNNER_UNAVAILABLE', category: 'INFRASTRUCTURE', decision: 'AGENT_RUNNER_UNAVAILABLE' }],
      failure: { code: 'AGENT_RUNNER_UNAVAILABLE', stage: 'VERIFY', category: 'INFRASTRUCTURE' } }), kind: sample.kind }
  }
  return { ...syntheticRecord({ ...base, environment: { containerCliOnPath: true, proxyTcpProbe: 'REFUSED' }, plan: false, verifies: [],
    calls: [{ stage: 'PLAN', error: 'MODEL_NETWORK' }], failure: { code: 'MODEL_NETWORK', stage: 'PLAN', category: 'MODEL_INTERFACE' } }), kind: sample.kind }
}

/**
 * Writes a complete synthetic batch the way the driver lays one out, inside a throwaway repository root
 * (frozen files copied to evals/generation/), so location and frozen-drift rules apply as in the real tree.
 */
export function syntheticBatch({ mode = 'REAL', parent = mkdtempSync(join(tmpdir(), 'd21a-eval-')), overrides = {}, omit = [] } = {}) {
  const frozen = loadFrozen()
  const repo = parent
  mkdirSync(join(repo, 'evals/generation'), { recursive: true })
  for (const path of Object.values(FROZEN)) copyFileSync(join(root, path), join(repo, path))
  const batchId = '2026-10-23T00-00-00Z-' + mode.toLowerCase() + '-fixture'
  const dir = join(repo, mode === 'REAL' ? 'evals/generation/runs' : '.local-data/d21-a/mock-runs', batchId)
  mkdirSync(join(dir, 'frozen'), { recursive: true })
  for (const [key, path] of Object.entries(FROZEN)) copyFileSync(join(root, path), join(dir, 'frozen', key + '.json'))
  const samples = plannedSamples(frozen)
  writeFileSync(join(dir, 'batch.json'), canonical({ schemaVersion: 1, batchId, mode,
    provider: mode === 'REAL' ? { id: 'deepseek', model: 'deepseek-flash' } : { id: 'deterministic-mock', model: 'plan-fixture-v1' },
    subset: null, git: { head: 'f'.repeat(40), scopedClean: true }, isolation: 'DETACHED_WORKTREE_AT_HEAD',
    frozen: Object.fromEntries(Object.entries(FROZEN).map(([key, path]) => [key, { path, copy: 'frozen/' + key + '.json', sha256: frozen[key].sha256 }])),
    samples: samples.map((s) => ({ id: s.id, kind: s.kind, category: s.category, baseRequirement: s.fault?.baseRequirement ?? null })) }))
  const lines = []
  for (const sample of samples) {
    const sdir = join(dir, 'samples', sample.id)
    mkdirSync(sdir, { recursive: true })
    writeFileSync(join(sdir, 'spec.json'), canonical({ schemaVersion: 1, batchId, sampleId: sample.id, kind: sample.kind, mode,
      category: sample.category, requirement: sample.requirement, fault: sample.fault }))
    writeFileSync(join(sdir, 'invocation.json'), canonical({ sampleId: sample.id, attempt: 1 }))
    writeFileSync(join(sdir, 'invocation-result.json'), canonical({ sampleId: sample.id, attempt: 1, exitCode: 0, timedOut: false }))
    if (!omit.includes(sample.id)) {
      const record = overrides[sample.id] ? overrides[sample.id](sample, batchId, mode) : defaultRecord(sample, batchId, mode)
      writeFileSync(join(sdir, 'record.json'), canonical(record))
    }
    lines.push(JSON.stringify({ sampleId: sample.id }))
  }
  writeFileSync(join(dir, 'batch-events.jsonl'), lines.join('\n') + '\n')
  writeFileSync(join(dir, 'batch-complete.json'), canonical({ batchId, secretScan: { credentialOccurrences: 0 } }))
  return { dir, parent, repo, batchId, samples, digest: (path) => sha256(path) }
}
