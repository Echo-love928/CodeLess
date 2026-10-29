// D21-A batch driver: each frozen sample runs exactly once in its own JVM; nothing is retried or deleted.
//   REAL: CODELESS_EVAL_REAL_APPROVED=1 node scripts/eval/run-batch.mjs --mode real
//   MOCK: node scripts/eval/run-batch.mjs --mode mock [--only SHOW-01,FAULT-ENV-01]   (harness dry run, never model evidence)
//   Resume after a crashed driver: --resume <batchDir> starts only samples that never started.
import { spawn, spawnSync } from 'node:child_process'
import { once } from 'node:events'
import { randomUUID } from 'node:crypto'
import { appendFileSync, closeSync, copyFileSync, existsSync, mkdirSync, openSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { delimiter, dirname, join, relative, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { FROZEN, REAL_RUNS, canonical, isRealRunLocation, loadFrozen, pathKey, plannedSamples, readJson, root, sha256, withoutContainerCli } from './lib.mjs'
import { writeReport } from './report.mjs'

const windows = process.platform === 'win32'
const SAMPLE_TIMEOUT_MS = 25 * 60 * 1000
const HARNESS = 'services/api/src/test/java/dev/codeless/api/eval/GenerationEvalIT.java'
const SCOPE = ['services/api/src', 'services/api/pom.xml', 'services/api/agent-runner.mjs', 'services/runner/src', 'prompts',
  'templates', 'infra/runner', 'infra/build-image', 'scripts/eval', 'evals/generation', 'tests/agent/prepare-runtime.mjs',
  'package.json', 'pnpm-lock.yaml']
const STRIPPED = /^(CODELESS_|SPRING_|JAVA_TOOL_OPTIONS$|JDK_JAVA_OPTIONS$|_JAVA_OPTIONS$|MAVEN_OPTS$)/i

export function parseArgs(argv) {
  const options = { mode: null, resume: null, out: null, only: null, isolated: null }
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i]
    const value = () => { if (i + 1 >= argv.length) throw new Error(flag + ' needs a value'); return argv[++i] }
    if (flag === '--mode') options.mode = value().toUpperCase()
    else if (flag === '--resume') options.resume = value()
    else if (flag === '--out') options.out = value()
    else if (flag === '--only') options.only = value().split(',').filter(Boolean)
    else if (flag === '--in-place') options.isolated = false
    else throw new Error('unknown argument ' + flag)
  }
  if (!['REAL', 'MOCK'].includes(options.mode)) throw new Error('--mode real|mock is required')
  if (options.only && options.mode === 'REAL') throw new Error('--only is a dry-run aid; a REAL batch always runs every frozen sample')
  if (options.isolated === null) options.isolated = options.mode === 'REAL'
  return options
}

export function newBatchId(mode, now) {
  return now.toISOString().slice(0, 19).replaceAll(':', '-') + 'Z-' + mode.toLowerCase() + '-' + randomUUID().slice(0, 8)
}

export function validNetworkPreflight(network, now = Date.now()) {
  const completed = Date.parse(network?.completedAt)
  return network?.status === 'PASSED' && network.tlsVerified === 12 && network.transportReached === 12 &&
    network.endpoint === 'https://api.deepseek.com' && Number.isFinite(completed) && completed <= now && now - completed <= 10 * 60000
}

function writeOnce(path, text) { writeFileSync(path, text, { flag: 'wx' }) }

function capture(command, args, options = {}) {
  const result = spawnSync(command, args, { cwd: root, encoding: 'utf8', windowsHide: true, timeout: 600000, ...options })
  return { status: result.status, signal: result.signal, error: result.error?.message ?? null,
    stdout: (result.stdout ?? '').trim(), stderr: (result.stderr ?? '').trim() }
}

export function gitState(cwd = root) {
  const git = (...args) => capture('git', args, { cwd }).stdout
  // Batch outputs and command evidence never feed generation, so they may change while a batch runs.
  const scoped = git('status', '--porcelain', '--untracked-files=all', '--', ...SCOPE, ':(exclude)' + REAL_RUNS, ':(exclude)evals/generation/evidence')
  return { head: git('rev-parse', 'HEAD'), branch: git('rev-parse', '--abbrev-ref', 'HEAD'),
    scopedClean: scoped === '', scopedStatus: scoped, scope: SCOPE }
}

export function javaHome(env = process.env) {
  const candidates = [env.JAVA_HOME, join(root, '.local-data/d07-a/tools/java21/jdk-21.0.12.1+1'),
    windows ? 'C:/Program Files/Java/jdk-21.0.12.1' : '/usr/lib/jvm/temurin-21-jdk-amd64', env.JAVA_HOME_21_X64].filter(Boolean)
  for (const home of candidates) {
    const java = join(home, 'bin', windows ? 'java.exe' : 'java')
    if (!existsSync(java)) continue
    const version = capture(java, ['-version'], { timeout: 10000 })
    if (version.status === 0 && /version "21\./.test(version.stderr + version.stdout)) return resolve(home)
  }
  throw new Error('Locked Java 21 required; set JAVA_HOME')
}

/** JVM environment for one sample. The provider credential reaches only REAL sample JVMs. */
export function sampleEnvironment({ base, mode, sample, specPath, outputDir, java, captureDir, revision }) {
  const env = {}
  for (const [key, value] of Object.entries(base)) if (!STRIPPED.test(key)) env[key] = value
  const previous = env[pathKey(env)] ?? ''
  for (const key of Object.keys(env)) if (key.toUpperCase() === 'PATH') delete env[key]
  let path = [join(java, 'bin'), ...(windows ? ['C:/Program Files/Git/cmd'] : []), dirname(process.execPath), previous].join(delimiter)
  let removed = []
  if (sample.fault?.injection === 'CONTAINER_CLI_UNAVAILABLE') ({ path, removed } = withoutContainerCli(path))
  env[windows ? 'Path' : 'PATH'] = path
  env.JAVA_HOME = java
  env.CODELESS_MODEL_PROVIDER = 'deterministic-mock' // Spring wiring only; the harness builds its own provider.
  env.CODELESS_EVAL_SAMPLE_FILE = specPath
  env.CODELESS_EVAL_OUTPUT_DIR = outputDir
  if (mode === 'REAL') {
    env.CODELESS_EVAL_REAL_APPROVED = '1'
    env.CODELESS_MODEL_API_KEY = base.CODELESS_MODEL_API_KEY
    env.CODELESS_MODEL_NAME = base.CODELESS_MODEL_NAME
    // Complete request/reply bytes for diagnosing invalid replies; private root only, scanned for the credential.
    if (captureDir) env.CODELESS_EVAL_PRIVATE_CAPTURE_DIR = captureDir
  }
  if (captureDir && ['SHOW-01', 'SHOW-02', 'TASK-01'].includes(sample.id))
    env.CODELESS_EVAL_RETAIN_ROOT = join(dirname(captureDir), 'retained', sample.id)
  if (revision && env.CODELESS_EVAL_RETAIN_ROOT) env.CODELESS_EVAL_REVISION = revision
  return { env, removedPathEntries: removed.length }
}

function maven(args) {
  const wrapper = windows ? 'services\\api\\mvnw.cmd' : './services/api/mvnw'
  const full = ['-B', '-ntp', '-f', 'services/api/pom.xml', ...args]
  return windows ? { command: process.env.ComSpec ?? 'cmd.exe', args: ['/d', '/c', wrapper, ...full], display: [wrapper, ...full] }
    : { command: wrapper, args: full, display: [wrapper, ...full] }
}

async function killTree(child) {
  if (child.exitCode !== null || child.signalCode !== null) return
  if (windows) spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, timeout: 30000 })
  else child.kill('SIGKILL')
}

/** Runs one sample JVM; the log is private because Spring logs are not curated evidence. */
async function executeSample({ cwd, env, log, timeoutMs }) {
  const { command, args, display } = maven(['-Dtest=GenerationEvalIT', '-Dsurefire.failIfNoSpecifiedTests=false', 'test'])
  mkdirSync(dirname(log), { recursive: true })
  const fd = openSync(log, 'wx')
  const started = Date.now()
  const child = spawn(command, args, { cwd, env, windowsHide: true, stdio: ['ignore', fd, fd] })
  closeSync(fd)
  let timedOut = false
  const timer = setTimeout(() => { timedOut = true; killTree(child) }, timeoutMs)
  let exitCode = null
  let signal = null
  let launchError = null
  try { [exitCode, signal] = await once(child, 'close') } catch (error) { launchError = error.message }
  clearTimeout(timer)
  return { command: display, exitCode, signal, timedOut, launchError, durationMs: Date.now() - started }
}

function preflight(cwd, java, env) {
  const steps = []
  const step = (name, command, args, options = {}) => {
    const result = capture(command, args, { cwd, env, ...options })
    steps.push({ name, command: [command, ...args].join(' '), exitCode: result.status, error: result.error,
      output: (result.stdout || result.stderr).split(/\r?\n/).slice(-3).join('\n') })
    return result
  }
  step('node', process.execPath, ['--version'])
  step('java', join(java, 'bin', windows ? 'java.exe' : 'java'), ['-version'])
  step('docker server', 'docker', ['version', '--format', '{{.Server.Version}}'])
  step('runtime prerequisites (pnpm deps, Chromium, build image)', process.execPath, ['tests/agent/prepare-runtime.mjs'], { timeout: 900000 })
  const image = step('build image id', 'docker', ['image', 'inspect', 'codeless-vue-build:d05', '--format', '{{.Id}}'])
  const { command, args } = maven(['-DskipTests', 'test-compile'])
  step('maven test-compile', command, args, { timeout: 900000 })
  return { ok: steps.every((s) => s.exitCode === 0), steps, buildImageId: image.status === 0 ? image.stdout : null }
}

/** Counts occurrences of a secret without ever writing it; returns per-file counts. */
export function secretOccurrences(paths, secret) {
  const hits = []
  if (!secret || secret.length < 8) return hits
  const visit = (path) => {
    if (!existsSync(path)) return
    let entries = null
    try { entries = readdirSync(path, { withFileTypes: true }) } catch { entries = null }
    if (entries) { for (const entry of entries) visit(join(path, entry.name)); return }
    const count = readFileSync(path, 'latin1').split(secret).length - 1
    if (count) hits.push({ path: relative(root, path).split('\\').join('/'), count })
  }
  for (const path of paths) visit(path)
  return hits
}

function isolatedCheckout(head, batchId) {
  const dir = join(root, '.local-data/d21-a/worktrees', batchId)
  const add = capture('git', ['worktree', 'add', '--detach', dir, head])
  if (add.status !== 0) throw new Error('git worktree add failed: ' + add.stderr)
  const install = capture(windows ? process.env.ComSpec ?? 'cmd.exe' : 'corepack',
    windows ? ['/d', '/c', 'corepack', 'pnpm', 'install', '--frozen-lockfile', '--prefer-offline'] : ['pnpm', 'install', '--frozen-lockfile', '--prefer-offline'],
    { cwd: dir, timeout: 900000 })
  if (install.status !== 0) throw new Error('pnpm install in isolated checkout failed: ' + install.stderr.slice(-2000))
  return dir
}

export async function runBatch(options, deps = {}) {
  const env = deps.env ?? process.env
  const now = deps.now ?? (() => new Date())
  const say = deps.log ?? ((line) => console.log(line))
  const frozen = loadFrozen()
  let planned = plannedSamples(frozen)
  if (options.only) planned = planned.filter((s) => options.only.includes(s.id))
  if (options.mode === 'REAL') {
    if (env.CODELESS_EVAL_REAL_APPROVED !== '1') throw new Error('REAL batch requires CODELESS_EVAL_REAL_APPROVED=1')
    if (!env.CODELESS_MODEL_API_KEY || !env.CODELESS_MODEL_NAME) throw new Error('REAL batch requires CODELESS_MODEL_API_KEY and CODELESS_MODEL_NAME')
    if (!deps.preflight) {
      if (!env.CODELESS_EVAL_NETWORK_PREFLIGHT) throw new Error('REAL batch needs network-preflight.mjs evidence before any sample starts')
      if (!validNetworkPreflight(readJson(env.CODELESS_EVAL_NETWORK_PREFLIGHT)))
        throw new Error('Network preflight missing, stale or unsuccessful; no REAL samples started')
    }
  }
  const git = (deps.gitState ?? gitState)()
  let dir
  if (options.resume) {
    dir = resolve(options.resume)
    const batch = readJson(join(dir, 'batch.json'))
    if (batch.mode !== options.mode) throw new Error('resume mode differs from batch mode')
    for (const key of Object.keys(FROZEN)) if (batch.frozen[key].sha256 !== frozen[key].sha256) throw new Error('frozen ' + key + ' changed since the batch started')
    if (batch.git.head !== git.head) throw new Error('HEAD changed since the batch started; start a new batch instead')
    planned = planned.filter((s) => batch.samples.some((b) => b.id === s.id))
  } else {
    const parent = resolve(options.out ?? join(root, options.mode === 'REAL' ? REAL_RUNS : '.local-data/d21-a/mock-runs'))
    if (options.mode === 'MOCK' && isRealRunLocation(parent)) throw new Error('mock batches never go under reserved REAL run directories')
    if (options.mode === 'REAL' && !git.scopedClean) throw new Error('REAL batch requires the harness and frozen set committed:\n' + git.scopedStatus)
    const id = newBatchId(options.mode, now())
    dir = join(parent, id)
    mkdirSync(parent, { recursive: true })
    mkdirSync(dir)
    mkdirSync(join(dir, 'frozen'))
    mkdirSync(join(dir, 'samples'))
    for (const [key, path] of Object.entries(FROZEN)) copyFileSync(join(root, path), join(dir, 'frozen', key + '.json'))
    // Committed blob bytes: platform-independent, unlike a working copy under core.autocrlf.
    const digest = (path) => {
      const blob = spawnSync('git', ['cat-file', 'blob', git.head + ':' + path], { cwd: root, windowsHide: true })
      return blob.status === 0 ? sha256(blob.stdout) : null // null: not committed (dry runs only; REAL requires a clean scope)
    }
    writeOnce(join(dir, 'batch.json'), canonical({
      schemaVersion: 1, batchId: id, mode: options.mode, createdAt: now().toISOString(),
      provider: options.mode === 'REAL' ? { id: 'deepseek', model: env.CODELESS_MODEL_NAME } : { id: 'deterministic-mock', model: 'plan-fixture-v1' },
      realModelEvidence: options.mode === 'REAL',
      subset: options.only ?? null,
      git: { head: git.head, branch: git.branch, scopedClean: git.scopedClean, scopedStatus: git.scopedStatus, scope: git.scope },
      isolation: options.isolated ? 'DETACHED_WORKTREE_AT_HEAD' : 'IN_PLACE',
      frozen: Object.fromEntries(Object.entries(FROZEN).map(([key, path]) => [key, { path, copy: 'frozen/' + key + '.json', sha256: frozen[key].sha256 }])),
      code: Object.fromEntries([HARNESS, 'scripts/eval/run-batch.mjs', 'scripts/eval/lib.mjs', 'scripts/eval/ledger.mjs', 'scripts/eval/report.mjs']
        .map((path) => [path, digest(path)])),
      samples: planned.map((s) => ({ id: s.id, kind: s.kind, category: s.category, baseRequirement: s.fault?.baseRequirement ?? null })),
      policy: { attemptsPerSample: 1, outerRetries: 0, deleteFailedSamples: false, rerun: 'NEW_BATCH_ONLY' }
    }))
  }
  const batch = readJson(join(dir, 'batch.json'))
  const batchId = batch.batchId
  const privateRoot = join(deps.privateRoot ?? join(root, '.local-data/d21-a/batches'), batchId)
  mkdirSync(privateRoot, { recursive: true })
  const cwd = deps.cwd ?? (options.isolated ? isolatedCheckout(batch.git.head, batchId + (options.resume ? '-resume-' + randomUUID().slice(0, 4) : '')) : root)
  const java = deps.javaHome ? deps.javaHome() : javaHome(env)
  const checks = deps.preflight ? deps.preflight() : preflight(cwd, java, sampleEnvironment({ base: env, mode: 'MOCK', sample: {}, specPath: '', outputDir: '', java }).env)
  if (options.mode === 'REAL' && !deps.preflight) {
    checks.network = readJson(env.CODELESS_EVAL_NETWORK_PREFLIGHT)
    checks.ok = checks.ok && validNetworkPreflight(checks.network)
  }
  const preflightName = 'preflight-' + (readdirSync(dir).filter((name) => name.startsWith('preflight-')).length + 1) + '.json'
  writeOnce(join(dir, preflightName), canonical({ at: now().toISOString(), checkout: cwd === root ? 'IN_PLACE' : 'ISOLATED', ...checks }))
  if (!checks.ok) throw new Error('preflight failed; no sample started (' + preflightName + ')')
  say(JSON.stringify({ batch: relative(root, dir), samples: planned.length, cwd: relative(root, cwd) || '.' }))
  for (const sample of planned) {
    const sdir = join(dir, 'samples', sample.id)
    if (existsSync(join(sdir, 'invocation.json'))) { say(sample.id + ' already started; never rerun'); continue }
    mkdirSync(sdir, { recursive: true })
    if (readdirSync(sdir).length) throw new Error(sample.id + ' has files but no invocation record; inspect manually')
    const spec = { schemaVersion: 1, batchId, sampleId: sample.id, kind: sample.kind, mode: options.mode, category: sample.category,
      requirement: sample.requirement, fault: sample.fault, runConfig: { runtimeBudget: frozen.runConfig.value.runtimeBudget },
      frozenDigests: Object.fromEntries(Object.keys(FROZEN).map((key) => [key, frozen[key].sha256])) }
    writeOnce(join(sdir, 'spec.json'), canonical(spec))
    const { env: jvm, removedPathEntries } = sampleEnvironment({ base: env, mode: options.mode, sample,
      specPath: join(sdir, 'spec.json'), outputDir: sdir, java, captureDir: join(privateRoot, sample.id + '-wire'), revision: batch.git.head })
    const log = join(privateRoot, sample.id + '.log')
    writeOnce(join(sdir, 'invocation.json'), canonical({ schemaVersion: 1, sampleId: sample.id, attempt: 1, startedAt: now().toISOString(),
      harness: 'GenerationEvalIT', checkout: cwd === root ? 'IN_PLACE' : 'ISOLATED', head: batch.git.head,
      environmentFault: sample.fault?.class === 'ENVIRONMENT' ? sample.fault.injection : null, removedPathEntries,
      credentialInJvm: options.mode === 'REAL', privateLog: relative(root, log).split('\\').join('/') }))
    say(sample.id + ' started')
    const result = await (deps.execute ?? executeSample)({ cwd, env: jvm, log, timeoutMs: SAMPLE_TIMEOUT_MS, sample, outputDir: sdir })
    const logBytes = existsSync(log) ? readFileSync(log) : Buffer.alloc(0)
    const outcome = { schemaVersion: 1, sampleId: sample.id, attempt: 1, finishedAt: now().toISOString(), ...result,
      privateLogSha256: sha256(logBytes), privateLogBytes: logBytes.length, recordPresent: existsSync(join(sdir, 'record.json')) }
    writeOnce(join(sdir, 'invocation-result.json'), canonical(outcome))
    if (result.exitCode !== 0) {
      const tail = logBytes.toString('utf8').split(/\r?\n/).slice(-150).join('\n')
      writeOnce(join(sdir, 'harness-log-tail.txt'), env.CODELESS_MODEL_API_KEY ? tail.split(env.CODELESS_MODEL_API_KEY).join('<redacted>') : tail)
    }
    appendFileSync(join(dir, 'batch-events.jsonl'), JSON.stringify({ sampleId: sample.id, exitCode: result.exitCode,
      timedOut: result.timedOut, recordPresent: outcome.recordPresent, finishedAt: outcome.finishedAt }) + '\n')
    say(sample.id + ' exit=' + result.exitCode + ' record=' + outcome.recordPresent)
  }
  const finished = batch.samples.every((s) => existsSync(join(dir, 'samples', s.id, 'invocation-result.json')))
  const leaks = secretOccurrences([dir], env.CODELESS_MODEL_API_KEY)
  const privateLeaks = secretOccurrences([privateRoot], env.CODELESS_MODEL_API_KEY)
  if (finished && !existsSync(join(dir, 'batch-complete.json'))) {
    writeOnce(join(dir, 'batch-complete.json'), canonical({ batchId, completedAt: now().toISOString(), samples: batch.samples.length,
      secretScan: { scanned: ['batch directory', 'private sample logs'], credentialOccurrences: leaks.length + privateLeaks.length,
        method: 'exact credential bytes searched; the value itself is never written' } }))
  }
  if (cwd !== root && !deps.cwd) {
    const removal = capture('git', ['worktree', 'remove', '--force', cwd])
    say('isolated checkout removal exit=' + removal.status)
  }
  if (leaks.length || privateLeaks.length) throw new Error('credential bytes found in outputs; do not commit: ' + JSON.stringify([...leaks, ...privateLeaks]))
  writeReport(dir)
  return dir
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  runBatch(parseArgs(process.argv.slice(2))).then((dir) => console.log(JSON.stringify({ batch: dir, status: 'FINISHED' })))
    .catch((error) => { console.error(error.message); process.exitCode = 1 })
}
