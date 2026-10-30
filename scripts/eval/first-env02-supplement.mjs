// Explicitly authorized first actual JVM only. Never resumes or rewrites the original incomplete batch.
import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, openSync, closeSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'
import { CANDIDATE, contained } from './budgeted-batch.mjs'
import { cnyToNanos } from './cny-budget.mjs'
import { sha256, canonical, plannedSamples, loadFrozen } from './lib.mjs'
import { faultSummary } from './ledger.mjs'
const root = resolve(fileURLToPath(new URL('../../', import.meta.url)))
const batch = contained(root, join(root, 'evals/results/generation/runs/2026-10-30T08-15-32Z-real-29ffed9b'))
const publicRoot = join(root, 'evals/results/D25-A/third-round-2026-10-30')
const candidate = join(root, '.local-data/d25-a/quality-fixes')
const privateRoot = join(root, '.local-data/d25-a/third-2026-10-30/env02-supplement')
const output = join(publicRoot, 'supplement-env02'), id = 'FAULT-ENV-02'
const read = path => JSON.parse(readFileSync(path, 'utf8'))
const bound = '0.124576', oldBound = '1.63467', combinedBound = '1.759246'
assert.equal(process.env.CODELESS_EVAL_ENV02_FIRST_JVM_APPROVED, '1', 'Explicit user exception required')
assert.equal(process.env.CODELESS_MODEL_NAME, 'deepseek-flash'); assert.ok(process.env.CODELESS_MODEL_API_KEY?.length >= 8)
assert.equal(read(join(batch, 'batch.json')).git.head, CANDIDATE)
const old = read(join(batch, 'samples', id, 'invocation-result.json'))
assert.equal(old.launchError, 'CNY_BUDGET_NOT_STARTED'); assert.equal(old.exitCode, null)
assert.equal(old.recordPresent, false); assert.equal(old.durationMs, 0)
assert.equal(existsSync(join(batch, 'samples', id, 'record.json')), false)
const controller = read(join(publicRoot, 'controller/controller-state.json'))
assert.equal(controller.budget.reservedOrSettledUpperCny, oldBound); assert.equal(controller.budget.active, null)
assert.equal(controller.invocations.filter(v => v.launched).length, 13)
assert.equal(cnyToNanos(oldBound) + cnyToNanos(bound), cnyToNanos(combinedBound))
assert.ok(cnyToNanos(combinedBound) <= cnyToNanos('2'))
const specBytes = readFileSync(join(batch, 'samples', id, 'spec.json')), spec = JSON.parse(specBytes)
assert.equal(spec.sampleId, id); assert.equal(spec.mode, 'REAL')
assert.equal(spec.fault.injection, 'MODEL_ENDPOINT_UNREACHABLE')
assert.equal(spec.fault.expected.modelCalls, 1); assert.equal(spec.fault.expected.repairRounds, 0)
assert.equal(spec.runConfig.runtimeBudget.chargedTokens, 50000)
assert.equal(spec.runConfig.runtimeBudget.outputTokensPerRequest, 4096)
const env = { ...process.env }, java = join(root, '.local-data/d07-a/tools/java21/jdk-21.0.12.1+1')
let index = Number(env.GIT_CONFIG_COUNT ?? 0)
for (const path of [root, candidate]) {
  env['GIT_CONFIG_KEY_' + index] = 'safe.directory'; env['GIT_CONFIG_VALUE_' + index] = path.replaceAll('\\', '/'); index++
}
env.GIT_CONFIG_COUNT = String(index)
const git = (...args) => {
  const r = spawnSync('git', args, { cwd: candidate, env, encoding: 'utf8', windowsHide: true })
  assert.equal(r.status, 0); return r.stdout.trim()
}
assert.equal(git('rev-parse', 'HEAD'), CANDIDATE)
const driver = await import(pathToFileURL(join(candidate, 'scripts/eval/run-batch.mjs')).href)
for (const [key, value] of Object.entries(env)) if (key.startsWith('GIT_CONFIG_')) process.env[key] = value
assert.equal(driver.gitState(candidate).scopedClean, true)
const previous = read(join(publicRoot, 'launch-started.json'))
for (const [path, digest] of Object.entries(previous.sourceDigests)) assert.equal(sha256(readFileSync(join(root, path))), digest)
const planned = plannedSamples(loadFrozen(candidate)).find(row => row.id === id)
assert.ok(planned && planned.fault.injection === spec.fault.injection)
const digests = directory => {
  const values = {}
  const visit = (dir, prefix = '') => { for (const entry of readdirSync(dir, { withFileTypes: true })) {
    assert.ok(!entry.isSymbolicLink()); const name = prefix + entry.name
    if (entry.isDirectory()) visit(join(dir, entry.name), name + '/')
    else values[name] = sha256(readFileSync(join(dir, entry.name)))
  } }
  visit(directory); return values
}
const originalDigests = digests(batch)
assert.equal(existsSync(privateRoot), false, 'First execution already claimed; do not retry')
assert.equal(existsSync(output), false, 'Supplement evidence already exists; do not overwrite')
mkdirSync(privateRoot); mkdirSync(output)
writeFileSync(join(output, 'spec.json'), specBytes, { flag: 'wx' })
const startedAt = new Date().toISOString(), permit = { startedAt, candidate: CANDIDATE, sampleId: id,
  consent: 'User explicitly allowed a separately recorded first JVM; retain original refusal and incomplete status',
  oldBoundCny: oldBound, newReservationCny: bound, combinedUpperCny: combinedBound, budgetCapCny: '2',
  basis: 'Forced unreachable proxy: first PLAN fails terminally; no retries. Original 50000 total tokens and 4096 output cap unchanged.',
  originalBatchId: spec.batchId, originalDigests, originalBatchMustRemainIncomplete: true, retries: 0 }
writeFileSync(join(privateRoot, 'first-jvm-permit.private.json'), canonical(permit), { flag: 'wx', mode: 0o600 })
writeFileSync(join(output, 'invocation.json'), canonical({ ...permit, harness: 'GenerationEvalIT', kind: 'SEPARATE_FIRST_ACTUAL_JVM' }), { flag: 'wx' })
const { env: jvm } = driver.sampleEnvironment({ base: env, mode: 'REAL', sample: planned,
  specPath: join(output, 'spec.json'), outputDir: output, java, revision: CANDIDATE })
jvm.CODELESS_EVAL_RETAIN_ROOT = join(privateRoot, 'retained', id); jvm.CODELESS_EVAL_REVISION = CANDIDATE
jvm.CODELESS_EVAL_GIT_BASH = 'C:/Program Files/Git/bin/bash.exe'
jvm.NO_PROXY = jvm.no_proxy = '127.0.0.1,localhost,::1'
const args = ['-B', '-ntp', '-f', 'services/api/pom.xml', '-Dtest=GenerationEvalIT', '-Dsurefire.failIfNoSpecifiedTests=false', 'test']
const wrapper = process.platform === 'win32' ? 'services\\api\\mvnw.cmd' : './services/api/mvnw'
const command = [wrapper, ...args], log = join(privateRoot, 'jvm.log'), fd = openSync(log, 'wx')
const child = process.platform === 'win32'
  ? spawn(jvm.ComSpec ?? 'cmd.exe', ['/d', '/c', ...command], { cwd: candidate, env: jvm, windowsHide: true, stdio: ['ignore', fd, fd] })
  : spawn(wrapper, args, { cwd: candidate, env: jvm, stdio: ['ignore', fd, fd] })
closeSync(fd)
let timedOut = false
const timer = setTimeout(() => {
  timedOut = true
  if (process.platform === 'win32') spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true })
  else child.kill('SIGKILL')
}, 25 * 60000)
const result = await new Promise(done => {
  child.once('error', e => done({ exitCode: null, signal: null, launchError: e.code }))
  child.once('close', (exitCode, signal) => done({ exitCode, signal, launchError: null }))
})
clearTimeout(timer)
const logBytes = readFileSync(log)
assert.equal(logBytes.includes(Buffer.from(process.env.CODELESS_MODEL_API_KEY)), false, 'Secret in private log')
const invocation = { sampleId: id, kind: 'SEPARATE_FIRST_ACTUAL_JVM', startedAt, finishedAt: new Date().toISOString(),
  command, ...result, timedOut, recordPresent: existsSync(join(output, 'record.json')), privateLogSha256: sha256(logBytes), privateLogBytes: logBytes.length }
writeFileSync(join(output, 'invocation-result.json'), canonical(invocation), { flag: 'wx' })
const record = invocation.recordPresent ? read(join(output, 'record.json')) : null
const faults = faultSummary([{ planned, spec, invocation, record }])
assert.deepEqual(digests(batch), originalDigests, 'Never change original evidence')
assert.equal(git('rev-parse', 'HEAD'), CANDIDATE); assert.equal(driver.gitState(candidate).scopedClean, true)
const summary = { ...invocation, candidate: CANDIDATE, originalBatchId: spec.batchId,
  originalBatchUnchanged: true, originalBatchStillIncomplete: true, acceptedByB: null, faults,
  fee: { currency: 'CNY', originalUpperCny: oldBound, supplementHeldUpperCny: bound, combinedUpperCny: combinedBound, capCny: '2', actualCny: null },
  retained: existsSync(join(privateRoot, 'retained', id, 'retained.json')), retries: 0,
  note: 'This supplement never replaces the original refusal/report and is not automatically counted as original-batch success. Unknown usage stays unknown.' }
writeFileSync(join(output, 'summary.json'), canonical(summary), { flag: 'wx' })
console.log(JSON.stringify({ output, exitCode: result.exitCode, originalBatchUnchanged: true, retained: summary.retained,
  faultStatus: faults.results[0].status, usage: faults.usage, combinedUpperCny: combinedBound, acceptedByB: null }))
process.exitCode = result.exitCode === 0 && faults.results[0].status === 'PASSED' && summary.retained ? 0 : result.exitCode || 1
