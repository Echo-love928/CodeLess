import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { delimiter, join } from 'node:path'
import { canonical, withoutContainerCli } from '../../../scripts/eval/lib.mjs'
import { parseArgs, runBatch, sampleEnvironment, secretOccurrences, validNetworkPreflight } from '../../../scripts/eval/run-batch.mjs'
import { defaultRecord } from './fixtures.mjs'
import { isRealRunLocation, REAL_RUNS, REAL_RESULT_RUNS, root } from '../../../scripts/eval/lib.mjs'

test('D25 REAL roots retain segment boundaries and reject traversal', () => {
  for (const directory of [REAL_RUNS, REAL_RESULT_RUNS]) {
    assert.equal(isRealRunLocation(join(root, directory)), true)
    assert.equal(isRealRunLocation(join(root, directory, 'batch')), true)
    assert.equal(isRealRunLocation(join(root, directory + '-mock', 'batch')), false)
    assert.equal(isRealRunLocation(join(root, directory, '..', 'mock')), false)
  }
  assert.equal(isRealRunLocation(join(root, '.local-data/mock')), false)
})

test('D25 MOCK driver rejects both reserved REAL roots before output creation', async () => {
  for (const directory of [REAL_RUNS, REAL_RESULT_RUNS]) await assert.rejects(runBatch({ mode: 'MOCK', out: join(root, directory), isolated: false }, {
    gitState: () => ({ head: 'test', branch: 'test', scopedClean: true }),
  }), /mock batches never go under/)
})

const SECRET = 'sk-d21-synthetic-credential-0123456789'

test('REAL network gate requires fresh complete normal TLS and JVM evidence', () => {
  const now = Date.parse('2026-10-25T07:00:00Z'), good = { status: 'PASSED', tlsVerified: 12, transportReached: 12,
    endpoint: 'https://api.deepseek.com', completedAt: new Date(now - 60000).toISOString() }
  assert.equal(validNetworkPreflight(good, now), true)
  for (const patch of [{ status: 'BLOCKED' }, { tlsVerified: 11 }, { transportReached: 11 }, { endpoint: 'http://api.deepseek.com' },
    { completedAt: 'invalid' }, { completedAt: new Date(now + 1).toISOString() }, { completedAt: new Date(now - 600001).toISOString() }])
    assert.equal(validNetworkPreflight({ ...good, ...patch }, now), false)
  assert.equal(validNetworkPreflight(null, now), false)
})

function harness(t, { failOn = [], env = {} } = {}) {
  const parent = mkdtempSync(join(tmpdir(), 'd21a-driver-'))
  t.after(() => rmSync(parent, { recursive: true, force: true }))
  const calls = []
  const deps = {
    env: { CODELESS_EVAL_REAL_APPROVED: '1', CODELESS_MODEL_API_KEY: SECRET, CODELESS_MODEL_NAME: 'deepseek-flash', Path: 'C:/bin', ...env },
    now: () => new Date('2026-10-23T01:02:03Z'), log: () => {}, cwd: parent, privateRoot: join(parent, 'private'),
    gitState: () => ({ head: 'a'.repeat(40), branch: 'test', scopedClean: true, scopedStatus: '', scope: [] }),
    javaHome: () => join(parent, 'jdk'), preflight: () => ({ ok: true, steps: [] }),
    execute: async ({ sample, outputDir, env: jvm, log }) => {
      calls.push({ id: sample.id, env: jvm })
      mkdirSync(join(log, '..'), { recursive: true })
      writeFileSync(log, 'synthetic log for ' + sample.id + '\n')
      if (failOn.includes(sample.id)) return { exitCode: 1, signal: null, timedOut: false, durationMs: 5 }
      const spec = JSON.parse(readFileSync(join(outputDir, 'spec.json'), 'utf8'))
      writeFileSync(join(outputDir, 'record.json'), canonical(defaultRecord({ ...sample }, spec.batchId, spec.mode)))
      return { exitCode: 0, signal: null, timedOut: false, durationMs: 5 }
    }
  }
  return { parent, deps, calls }
}

test('REAL batches need explicit approval, a credential and a committed scope before anything is created', async (t) => {
  const { parent, deps } = harness(t)
  await assert.rejects(runBatch({ mode: 'REAL', out: parent }, { ...deps, env: { ...deps.env, CODELESS_EVAL_REAL_APPROVED: '' } }), /APPROVED=1/)
  await assert.rejects(runBatch({ mode: 'REAL', out: parent }, { ...deps, env: { ...deps.env, CODELESS_MODEL_API_KEY: '' } }), /CODELESS_MODEL_API_KEY/)
  await assert.rejects(runBatch({ mode: 'REAL', out: parent }, { ...deps, gitState: () => ({ head: 'a', scopedClean: false, scopedStatus: ' M prompts/x' }) }), /committed/)
  assert.deepEqual(readdirSync(parent), [])
  assert.throws(() => parseArgs(['--mode', 'real', '--only', 'SHOW-01']), /always runs every frozen sample/)
})

test('D21-A-04: every sample runs exactly once; a failed sample is kept and the batch continues', async (t) => {
  const { parent, deps, calls } = harness(t, { failOn: ['TASK-01'] })
  const dir = await runBatch({ mode: 'REAL', out: parent, isolated: false }, deps)
  assert.deepEqual(calls.map((c) => c.id), ['SHOW-01', 'SHOW-02', 'SHOW-03', 'TASK-01', 'TASK-02', 'TASK-03', 'CAT-01', 'CAT-02', 'CAT-03',
    'FAULT-CODE-01', 'FAULT-CODE-02', 'FAULT-CODE-03', 'FAULT-ENV-01', 'FAULT-ENV-02'])
  const failed = JSON.parse(readFileSync(join(dir, 'samples/TASK-01/invocation-result.json'), 'utf8'))
  assert.deepEqual([failed.exitCode, failed.attempt, failed.recordPresent], [1, 1, false])
  assert.ok(existsSync(join(dir, 'samples/TASK-01/harness-log-tail.txt')))
  const report = JSON.parse(readFileSync(join(dir, 'report.json'), 'utf8'))
  assert.deepEqual([report.requirements.denominator, report.requirements.finalSuccess.count, report.requirements.missingRecords], [9, 8, ['TASK-01']])
  assert.equal(JSON.parse(readFileSync(join(dir, 'batch-complete.json'), 'utf8')).secretScan.credentialOccurrences, 0)
})

test('D21-A-04: resume never restarts a sample that already started, even one that failed', async (t) => {
  const first = harness(t, { failOn: ['SHOW-02'] })
  let stop = 3
  const interrupted = { ...first.deps, execute: async (args) => { if (--stop < 0) throw new Error('driver crashed'); return first.deps.execute(args) } }
  await assert.rejects(runBatch({ mode: 'REAL', out: first.parent, isolated: false }, interrupted), /driver crashed/)
  const dir = join(first.parent, readdirSync(first.parent).find((name) => name.includes('-real-')))
  assert.deepEqual(first.calls.map((c) => c.id), ['SHOW-01', 'SHOW-02', 'SHOW-03'])
  // SHOW-01..03 finished; the driver died after TASK-01 started (invocation.json) and before it finished.
  assert.ok(existsSync(join(dir, 'samples/TASK-01/invocation.json')))
  assert.ok(!existsSync(join(dir, 'samples/TASK-01/invocation-result.json')))
  first.calls.length = 0
  await runBatch({ mode: 'REAL', resume: dir, isolated: false }, first.deps)
  assert.deepEqual(first.calls.map((c) => c.id), ['TASK-02', 'TASK-03', 'CAT-01', 'CAT-02', 'CAT-03',
    'FAULT-CODE-01', 'FAULT-CODE-02', 'FAULT-CODE-03', 'FAULT-ENV-01', 'FAULT-ENV-02'])
  const report = JSON.parse(readFileSync(join(dir, 'report.json'), 'utf8'))
  assert.deepEqual(report.requirements.missingRecords, ['SHOW-02', 'TASK-01']) // both stay failures in the denominator
  assert.ok(!existsSync(join(dir, 'batch-complete.json'))) // TASK-01 never finished, so the batch is not complete
})

test('mock batches cannot be written as real evidence, and resuming a finished batch starts nothing', async (t) => {
  const { parent, deps, calls } = harness(t)
  await assert.rejects(runBatch({ mode: 'MOCK', out: join(process.cwd(), 'evals/generation/runs'), isolated: false }, deps), /never go under/)
  const dir = await runBatch({ mode: 'MOCK', out: parent, isolated: false, only: ['SHOW-01'] }, deps)
  const batch = JSON.parse(readFileSync(join(dir, 'batch.json'), 'utf8'))
  assert.deepEqual([batch.mode, batch.realModelEvidence, batch.provider.id, batch.subset], ['MOCK', false, 'deterministic-mock', ['SHOW-01']])
  await assert.rejects(runBatch({ mode: 'REAL', resume: dir, isolated: false }, deps), /resume mode differs/)
  calls.length = 0
  await runBatch({ mode: 'MOCK', resume: dir, isolated: false, only: ['SHOW-01'] }, deps)
  assert.deepEqual(calls, [])
  const record = readFileSync(join(dir, 'samples/SHOW-01/record.json'))
  assert.throws(() => writeFileSync(join(dir, 'samples/SHOW-01/invocation-result.json'), 'x', { flag: 'wx' }), /EEXIST/)
  assert.ok(readFileSync(join(dir, 'samples/SHOW-01/record.json')).equals(record))
})

test('the credential reaches only REAL sample JVMs and is never written to batch files', async (t) => {
  const { parent, deps, calls } = harness(t)
  const dir = await runBatch({ mode: 'MOCK', out: parent, isolated: false, only: ['SHOW-01'] }, deps)
  assert.equal(calls[0].env.CODELESS_MODEL_API_KEY, undefined)
  assert.equal(calls[0].env.CODELESS_MODEL_PROVIDER, 'deterministic-mock')
  calls.length = 0
  const real = await runBatch({ mode: 'REAL', out: join(parent, 'real'), isolated: false }, deps)
  assert.equal(calls[0].env.CODELESS_MODEL_API_KEY, SECRET)
  assert.deepEqual(secretOccurrences([dir, real], SECRET), [])
  writeFileSync(join(real, 'samples/SHOW-01/leak.txt'), 'x' + SECRET + 'y' + SECRET)
  assert.deepEqual(secretOccurrences([real], SECRET).map((hit) => hit.count), [2])
})

test('the container-CLI fault removes exactly the PATH entries that hold a docker executable', () => {
  const probe = (path) => /docker-bin[\\/]docker\.exe$/.test(path)
  // No drive letters: ':' is the PATH delimiter on Linux CI.
  const value = ['/opt/node', '/opt/docker-bin', '/usr/git', '/opt/docker-bin'].join(delimiter)
  assert.deepEqual(withoutContainerCli(value, probe), { path: ['/opt/node', '/usr/git'].join(delimiter), removed: ['/opt/docker-bin', '/opt/docker-bin'] })
  const base = { PATH: 'C:/x', CODELESS_MODEL_API_KEY: SECRET, CODELESS_MODEL_NAME: 'm', SPRING_PROFILES_ACTIVE: 'prod', JAVA_TOOL_OPTIONS: '-Dx' }
  const { env } = sampleEnvironment({ base, mode: 'MOCK', sample: { fault: null }, specPath: 's', outputDir: 'o', java: 'J' })
  assert.deepEqual(Object.keys(env).filter((key) => /^(CODELESS_|SPRING_|JAVA_TOOL)/.test(key)).sort(),
    ['CODELESS_EVAL_OUTPUT_DIR', 'CODELESS_EVAL_SAMPLE_FILE', 'CODELESS_MODEL_PROVIDER'])
  // The private wire capture reaches only REAL sample JVMs, like the credential.
  const mock = sampleEnvironment({ base, mode: 'MOCK', sample: { fault: null }, specPath: 's', outputDir: 'o', java: 'J', captureDir: 'w' }).env
  assert.equal(mock.CODELESS_EVAL_PRIVATE_CAPTURE_DIR, undefined)
  const real = sampleEnvironment({ base, mode: 'REAL', sample: { fault: null }, specPath: 's', outputDir: 'o', java: 'J', captureDir: 'w' }).env
  assert.equal(real.CODELESS_EVAL_PRIVATE_CAPTURE_DIR, 'w')
})
