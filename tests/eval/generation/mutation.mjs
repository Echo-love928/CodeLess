// Negative controls for the D21-A tests: each mutation breaks one acceptance property in a temporary copy
// of scripts/eval, and the unchanged test suite must then fail. The working tree is never modified.
// Exit 0 only if the unmutated copy passes and every mutation is detected.
import { spawnSync } from 'node:child_process'
import { cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../../../', import.meta.url))
const MUTATIONS = [
  { id: 'T3 unknown usage reported as an exact total', file: 'scripts/eval/ledger.mjs',
    from: 'ledger.complete = recorded && ledger.knownCalls === ledger.calls', to: 'ledger.complete = true' },
  { id: 'T1 denominator taken from existing records', file: 'scripts/eval/ledger.mjs',
    from: 'const denominator = items.length', to: 'const denominator = items.filter((item) => item.record).length' },
  { id: 'T4 stale report accepted', file: 'scripts/eval/report.mjs',
    from: "problems.push(name + ' differs from recomputation')", to: 'void 0' },
  { id: 'T2 environment fault sent to REPAIR still passes', file: 'scripts/eval/ledger.mjs',
    from: "verify.every((value) => value.decision !== 'REPAIR')", to: 'true' },
  { id: 'D21-A-04 failed sample retried', file: 'scripts/eval/run-batch.mjs',
    from: 'const result = await (deps.execute ?? executeSample)({ cwd, env: jvm, log, timeoutMs: SAMPLE_TIMEOUT_MS, sample, outputDir: sdir })',
    to: 'let result = await (deps.execute ?? executeSample)({ cwd, env: jvm, log, timeoutMs: SAMPLE_TIMEOUT_MS, sample, outputDir: sdir })\n    if (result.exitCode !== 0) result = await (deps.execute ?? executeSample)({ cwd, env: jvm, log, timeoutMs: SAMPLE_TIMEOUT_MS, sample, outputDir: sdir })' },
  { id: 'credential passed to MOCK sample JVMs', file: 'scripts/eval/run-batch.mjs',
    from: "if (mode === 'REAL') {\n    env.CODELESS_EVAL_REAL_APPROVED", to: "if (true) {\n    env.CODELESS_EVAL_REAL_APPROVED" },
  // D21-B review of 6e707c0.
  { id: 'P1 READY counted although the sample JVM failed', file: 'scripts/eval/ledger.mjs',
    from: "const finalSuccess = outcome === 'READY' && !harnessError && processStatus === 'OK'", to: "const finalSuccess = outcome === 'READY' && !harnessError" },
  { id: 'P1 verifier accepts a success claim after a failed process', file: 'scripts/eval/verify-batch.mjs',
    from: 'cleanExit || claims.get(id) !== true', to: 'true' },
  { id: 'P1 fault result ignores the sample JVM exit', file: 'scripts/eval/ledger.mjs',
    from: "const checks = [check('sample JVM exit', 'OK', sample.execution)]", to: 'const checks = []' },
  { id: 'P2 missing call rows summed as zero (aggregate)', file: 'scripts/eval/ledger.mjs',
    from: 'if (usage.samplesWithoutTaskRecord > 0 || usage.samplesWithoutCallRecord > 0) {', to: 'if (usage.samplesWithoutTaskRecord > 0) {' },
  { id: 'P2 missing call rows summed as zero (sample)', file: 'scripts/eval/ledger.mjs',
    from: 'usage: usageLedger(calls), cache', to: 'usage: usageLedger(calls ?? []), cache' },
  { id: 'P2 unreadable journal charged as zero', file: 'scripts/eval/ledger.mjs',
    from: "  if (!journalRecorded(record)) return { calls: null, chargedTokens: null, estimatedCalls: null }\n", to: '' }
]

function copy() {
  const dir = mkdtempSync(join(tmpdir(), 'd21a-mutation-'))
  for (const path of ['scripts/eval', 'tests/eval/generation']) cpSync(join(root, path), join(dir, path), { recursive: true })
  mkdirSync(join(dir, 'evals/generation'), { recursive: true })
  for (const name of ['requirements.json', 'faults.json', 'run-config.json']) cpSync(join(root, 'evals/generation', name), join(dir, 'evals/generation', name))
  const repro = 'evals/generation/runs/2026-10-23T14-16-43Z-real-545bbebf/samples/SHOW-01' // the reviewer's unchanged real record
  cpSync(join(root, repro), join(dir, repro), { recursive: true })
  return dir
}
function run(dir) {
  const files = readdirSync(join(dir, 'tests/eval/generation')).filter((name) => name.endsWith('.test.mjs')).map((name) => join('tests/eval/generation', name))
  const result = spawnSync(process.execPath, ['--test', ...files], { cwd: dir, encoding: 'utf8', windowsHide: true, timeout: 300000 })
  const fail = /ℹ fail (\d+)/.exec(result.stdout ?? '')?.[1]
  return { exitCode: result.status, failedTests: fail === undefined ? null : Number(fail),
    failing: [...(result.stdout ?? '').matchAll(/^✖ (.+?) \(/gm)].map((m) => m[1]) }
}

const results = []
const control = copy()
const baseline = run(control)
rmSync(control, { recursive: true, force: true })
for (const mutation of MUTATIONS) {
  const dir = copy()
  const path = join(dir, mutation.file)
  const source = readFileSync(path, 'utf8').replaceAll('\r\n', '\n')
  const occurrences = source.split(mutation.from).length - 1
  if (occurrences !== 1) {
    results.push({ id: mutation.id, applied: false, occurrences, detected: false })
  } else {
    writeFileSync(path, source.replace(mutation.from, mutation.to))
    const outcome = run(dir)
    results.push({ id: mutation.id, applied: true, ...outcome, detected: outcome.exitCode !== 0 && outcome.failedTests > 0 })
  }
  rmSync(dir, { recursive: true, force: true })
}
const ok = baseline.exitCode === 0 && results.every((r) => r.applied && r.detected)
console.log(JSON.stringify({ baseline, mutations: results, ok }, null, 2))
process.exitCode = ok ? 0 : 1
