// Developer-only fixed D18-A acceptance commands. Records native exit/signal, HEAD, tested file digests, the raw log
// and this run's JUnit XML under .local-data/d18-a/runs/. No API/runtime shell capability is exposed by this script.
// Usage: node tests/recovery/record-command.mjs MODE
//   acceptance | regression | mutation | static | api | runner | e2e | gate
// `mutation` temporarily breaks three safeguards (draft convergence, version references, lease heartbeat), runs the
// acceptance tests, restores the exact original bytes and PASSES only if every expected test failed.
import { spawn, spawnSync } from 'node:child_process'
import { openSync, closeSync, mkdirSync, writeFileSync, renameSync, readFileSync, unlinkSync, readdirSync, copyFileSync, existsSync, realpathSync, rmSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join, relative } from 'node:path'
import { randomUUID, createHash } from 'node:crypto'

const repo = realpathSync(fileURLToPath(new URL('../../', import.meta.url)))
const [mode, ...extra] = process.argv.slice(2)
if (extra.length) throw new Error('Usage: record-command.mjs MODE')
const acceptance = 'RecoveryConvergenceTest,StorageSweeperTest,ProcessRestartRecoveryTest'
const tests = {
  acceptance,
  mutation: acceptance,
  // Changed: TaskQueueService (lease/recovery/convergence), TaskScheduler, BuildGateway/LocalBuildGateway, AgentLoop.
  regression: 'TaskQueueIntegrationTest,TaskHttpTest,TaskSseHttpTest,TaskDiagnosticsTest,AdminIntegrationTest,DataIntegrationTest,'
    + 'FileToolsIntegrationTest,PlanModelIntegrationTest,LocalBuildGatewayTest,RepairLoopIntegrationTest,AgentLoopIntegrationTest',
}
const api = 'services/api/src/main/java/dev/codeless/api/'
const mutations = [
  [api + 'recovery/DraftConvergence.java', '        if (code.isEmpty()) return List.of();', '        if (true) return List.of(); // MUTATION'],
  [api + 'recovery/StorageSweeper.java', '            if (versionReferenced(id)) {', '            if (false) { // MUTATION'],
  [api + 'recovery/StorageSweeper.java', '() -> !versionReferenced(id));', '() -> true); // MUTATION'],
  [api + 'tasks/TaskScheduler.java', '        long period = Math.max(100, lease.toMillis() / 3);', '        long period = 3_600_000; // MUTATION'],
]
const expectedMutationFailures = ['d18aT1ProcessKillAndRestartNeitherRepublishesNorReportsSuccess',
  'd18aT2RepeatedAndConcurrentCancelsConvergeOnceAndNeverThrow', 'heartbeatKeepsLiveLeaseAndCancelledWorkerIsReleasedOnlyAfterItStops',
  'abandonedLeaseConvergesToInterruptedWithinOneLeaseAndReleasesResources', 'd18aT4CleanupNeverDeletesPublishedPreviewOrUsableVersions']

let command, args
const windows = process.platform === 'win32'
if (Object.hasOwn(tests, mode)) {
  const maven = ['-f', 'services/api/pom.xml', `-Dtest=${tests[mode]}`, 'test']
  command = windows ? (process.env.ComSpec ?? 'cmd.exe') : './services/api/mvnw'
  args = windows ? ['/d', '/c', 'services\\api\\mvnw.cmd', ...maven] : maven
} else if (mode === 'gate') {
  command = process.execPath; args = ['scripts/ci-gate.mjs']
} else if (['api', 'static', 'runner', 'e2e'].includes(mode)) {
  command = windows ? (process.env.ComSpec ?? 'cmd.exe') : 'corepack'
  args = windows ? ['/d', '/c', 'corepack', 'pnpm', 'run', `verify:${mode}`] : ['pnpm', 'run', `verify:${mode}`]
} else throw new Error('Unknown fixed acceptance command mode')

const env = { ...process.env, CODELESS_MODEL_PROVIDER: 'deterministic-mock' }
for (const key of ['CODELESS_MODEL_API_KEY', 'CODELESS_MODEL_NAME', 'CODELESS_PLAYWRIGHT_CHANNEL']) delete env[key]
const base = join(repo, '.local-data/d18-a')
const run = join(base, 'runs', `${new Date().toISOString().replaceAll(':', '-')}-${mode}-${randomUUID()}`)
mkdirSync(run, { recursive: true })
const lock = join(base, 'command.lock')
const lockFd = openSync(lock, 'wx') // Never run two Maven/gate commands against the same target directory.
writeFileSync(lockFd, JSON.stringify({ pid: process.pid, run }))
env.CODELESS_RECOVERY_EVIDENCE_DIR = join(run, 'recovery')
const git = (...a) => spawnSync('git', a, { cwd: repo, encoding: 'utf8' })
const head = git('rev-parse', 'HEAD')
if (head.status !== 0) throw new Error('Cannot record the tested Git HEAD')
const scoped = ['services/api/src/main', 'services/api/src/test', 'services/api/pom.xml', 'tests/recovery']
const modified = git('diff', '--name-only', '-z', 'HEAD', '--', ...scoped), untracked = git('ls-files', '--others', '--exclude-standard', '-z', '--', ...scoped)
if (modified.status !== 0 || untracked.status !== 0) throw new Error('Cannot record tested file hashes')
const metadata = { mode, head: head.stdout.trim(), command: [command, ...args], startedAt: new Date().toISOString(), status: 'RUNNING',
  exitCode: null, signal: null, modelProvider: 'deterministic-mock',
  uncommittedScopedFiles: [...new Set((modified.stdout + untracked.stdout).split('\0').filter(Boolean))].map(path => ({ path,
    digest: existsSync(join(repo, path)) ? 'sha256:' + createHash('sha256').update(readFileSync(join(repo, path))).digest('hex') : null })) }
function save() {
  writeFileSync(join(run, 'run.json.pending'), JSON.stringify(metadata, null, 2) + '\n')
  renameSync(join(run, 'run.json.pending'), join(run, 'run.json'))
}

const originals = new Map()
if (mode === 'mutation') {
  if (metadata.uncommittedScopedFiles.length) throw new Error('mutation mode requires a clean committed tree')
  for (const [file, from, to] of mutations) {
    const path = join(repo, file)
    const text = originals.get(path)?.mutated ?? readFileSync(path, 'utf8')
    if (text.split(from).length !== 2) throw new Error(`mutation anchor not unique: ${file}`)
    if (!originals.has(path)) originals.set(path, { bytes: readFileSync(path), mutated: text })
    originals.get(path).mutated = text.replace(from, to)
  }
  for (const [path, entry] of originals) writeFileSync(path, entry.mutated)
  metadata.mutations = mutations.map(([file, from, to]) => ({ file, from: from.trim(), to: to.trim() }))
}
function restore() {
  for (const [path, entry] of originals) writeFileSync(path, entry.bytes)
  originals.clear()
}
process.once('SIGINT', () => { restore(); process.exit(130) })
save()
const fd = openSync(join(run, 'command.log'), 'wx')
// Only this run's JUnit reports are copied; stale reports from earlier Maven runs never count as evidence.
if (Object.hasOwn(tests, mode) || ['api', 'gate'].includes(mode)) rmSync(join(repo, 'services/api/target/surefire-reports'), { recursive: true, force: true })
console.log(JSON.stringify({ status: 'RUNNING', run: relative(repo, run) }))
const child = spawn(command, args, { cwd: repo, env, stdio: ['ignore', fd, fd], shell: false })
let completed = false
function failedTests(dir) {
  const failed = []
  for (const name of existsSync(dir) ? readdirSync(dir).filter(n => n.endsWith('.xml')) : []) {
    const xml = readFileSync(join(dir, name), 'utf8')
    // Passing cases are self-closing; never let a lazy body match run into the next <testcase>.
    for (const match of xml.matchAll(/<testcase\b([^>]*?)(?:\/>|>([\s\S]*?)<\/testcase>)/g)) {
      const name = match[1].match(/\bname="([^"]+)"/)?.[1]
      if (name && /<(failure|error)\b/.test(match[2] ?? '')) failed.push(name)
    }
  }
  return failed
}
function finish(code, signal, error) {
  if (completed) return
  completed = true; closeSync(fd)
  restore()
  metadata.completedAt = new Date().toISOString(); metadata.exitCode = code; metadata.signal = signal
  const log = readFileSync(join(run, 'command.log'))
  const maven = Object.hasOwn(tests, mode) || mode === 'api'
  const reports = join(repo, 'services/api/target/surefire-reports')
  if ((maven || mode === 'gate') && existsSync(reports)) {
    mkdirSync(join(run, 'junit'), { recursive: true })
    for (const name of readdirSync(reports).filter(name => /\.(xml|txt)$/.test(name))) copyFileSync(join(reports, name), join(run, 'junit', name))
  }
  if (mode === 'mutation') {
    // Negative control: the build must fail, and exactly through the expected tests.
    const failed = failedTests(join(run, 'junit'))
    metadata.failedTests = failed
    metadata.completionVerified = code !== 0 && expectedMutationFailures.every(name => failed.includes(name))
    metadata.restoredDigests = mutations.map(([file]) => file).filter((f, i, all) => all.indexOf(f) === i)
      .map(file => ({ file, digest: 'sha256:' + createHash('sha256').update(readFileSync(join(repo, file))).digest('hex'),
        matchesHead: git('diff', '--quiet', 'HEAD', '--', file).status === 0 }))
    metadata.status = error ? 'LAUNCH_FAILED' : metadata.completionVerified && metadata.restoredDigests.every(d => d.matchesHead) ? 'PASSED' : 'FAILED'
  } else {
    const marker = maven ? log.includes('[INFO] BUILD SUCCESS') : mode === 'gate' ? log.includes('[ci-gate] all stages passed') : true
    metadata.completionVerified = marker
    metadata.status = error ? 'LAUNCH_FAILED' : code === 0 && signal === null ? marker ? 'PASSED' : 'INCOMPLETE' : 'FAILED'
  }
  if (error) metadata.launchError = error.code ?? 'UNKNOWN'
  metadata.logDigest = 'sha256:' + createHash('sha256').update(log).digest('hex')
  save()
  closeSync(lockFd); unlinkSync(lock)
  console.log(JSON.stringify({ status: metadata.status, exitCode: code, signal, run: relative(repo, run) }))
  process.exitCode = metadata.status === 'PASSED' ? 0 : Number.isInteger(code) && code !== 0 ? code : 1
}
child.once('error', error => finish(null, null, error))
child.once('exit', (code, signal) => finish(code, signal))
