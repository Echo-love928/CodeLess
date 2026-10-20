// Developer-only fixed D17-A acceptance commands. Records native exit/signal, HEAD, tested file digests and the raw
// log under .local-data/d17-a/runs/. No API/runtime shell capability is exposed by this script.
// Usage: node tests/admin/record-command.mjs MODE   (unit | acceptance | regression | contracts | static | api | runner | e2e | gate)
import { spawn, spawnSync } from 'node:child_process'
import { openSync, closeSync, mkdirSync, writeFileSync, renameSync, readFileSync, unlinkSync, readdirSync, copyFileSync, existsSync, realpathSync, rmSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join, relative } from 'node:path'
import { randomUUID, createHash } from 'node:crypto'

const repo = realpathSync(fileURLToPath(new URL('../../', import.meta.url)))
const [mode, ...extra] = process.argv.slice(2)
if (extra.length) throw new Error('Usage: record-command.mjs MODE')
const unit = 'AdminRedactionTest,AdminAuditLogTest'
const tests = {
  unit,
  acceptance: `AdminIntegrationTest,${unit}`,
  // AuthFilter/AuthController (admin role check) and TaskQueueService (admin cancel) changed.
  regression: 'AuthIntegrationTest,AuthHttpTest,TaskHttpTest,TaskQueueIntegrationTest,TaskDiagnosticsTest,ApplicationIntegrationTest',
}
let command, args
const windows = process.platform === 'win32'
if (Object.hasOwn(tests, mode)) {
  const maven = ['-f', 'services/api/pom.xml', `-Dtest=${tests[mode]}`, 'test']
  command = windows ? (process.env.ComSpec ?? 'cmd.exe') : './services/api/mvnw'
  args = windows ? ['/d', '/c', 'services\\api\\mvnw.cmd', ...maven] : maven
} else if (mode === 'contracts') {
  command = process.execPath; args = ['tests/admin/validate-contract.mjs']
} else if (mode === 'gate') {
  command = process.execPath; args = ['scripts/ci-gate.mjs']
} else if (['api', 'static', 'runner', 'e2e'].includes(mode)) {
  command = windows ? (process.env.ComSpec ?? 'cmd.exe') : 'corepack'
  args = windows ? ['/d', '/c', 'corepack', 'pnpm', 'run', `verify:${mode}`] : ['pnpm', 'run', `verify:${mode}`]
} else throw new Error('Unknown fixed acceptance command mode')

const env = { ...process.env, CODELESS_MODEL_PROVIDER: 'deterministic-mock' }
for (const key of ['CODELESS_MODEL_API_KEY', 'CODELESS_MODEL_NAME', 'CODELESS_PLAYWRIGHT_CHANNEL']) delete env[key]
const base = join(repo, '.local-data/d17-a')
const run = join(base, 'runs', `${new Date().toISOString().replaceAll(':', '-')}-${mode}-${randomUUID()}`)
mkdirSync(run, { recursive: true })
const lock = join(base, 'command.lock')
const lockFd = openSync(lock, 'wx') // Never run two Maven/gate commands against the same target directory.
writeFileSync(lockFd, JSON.stringify({ pid: process.pid, run }))
env.CODELESS_ADMIN_EVIDENCE_DIR = join(run, 'admin')
const git = (...a) => spawnSync('git', a, { cwd: repo, encoding: 'utf8' })
const head = git('rev-parse', 'HEAD')
if (head.status !== 0) throw new Error('Cannot record the tested Git HEAD')
const scoped = ['services/api/src/main', 'services/api/src/test', 'services/api/pom.xml', 'tests/admin', 'contracts/admin']
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
save()
const fd = openSync(join(run, 'command.log'), 'wx')
// Only this run's JUnit reports are copied; stale reports from earlier Maven runs never count as evidence.
if (Object.hasOwn(tests, mode) || ['api', 'gate'].includes(mode)) rmSync(join(repo, 'services/api/target/surefire-reports'), { recursive: true, force: true })
console.log(JSON.stringify({ status: 'RUNNING', run: relative(repo, run) }))
const child = spawn(command, args, { cwd: repo, env, stdio: ['ignore', fd, fd], shell: false })
let completed = false
function finish(code, signal, error) {
  if (completed) return
  completed = true; closeSync(fd)
  metadata.completedAt = new Date().toISOString(); metadata.exitCode = code; metadata.signal = signal
  const log = readFileSync(join(run, 'command.log'))
  const maven = Object.hasOwn(tests, mode) || mode === 'api'
  const marker = maven ? log.includes('[INFO] BUILD SUCCESS') : mode === 'gate' ? log.includes('[ci-gate] all stages passed') : true
  metadata.completionVerified = marker
  metadata.status = error ? 'LAUNCH_FAILED' : code === 0 && signal === null ? marker ? 'PASSED' : 'INCOMPLETE' : 'FAILED'
  if (error) metadata.launchError = error.code ?? 'UNKNOWN'
  metadata.logDigest = 'sha256:' + createHash('sha256').update(log).digest('hex')
  const reports = join(repo, 'services/api/target/surefire-reports')
  if ((maven || mode === 'gate') && existsSync(reports)) {
    mkdirSync(join(run, 'junit'), { recursive: true })
    for (const name of readdirSync(reports).filter(name => /\.(xml|txt)$/.test(name))) copyFileSync(join(reports, name), join(run, 'junit', name))
  }
  save()
  closeSync(lockFd); unlinkSync(lock)
  console.log(JSON.stringify({ status: metadata.status, exitCode: code, signal, run: relative(repo, run) }))
  process.exitCode = metadata.status === 'PASSED' ? 0 : Number.isInteger(code) && code !== 0 ? code : 1
}
child.once('error', error => finish(null, null, error))
child.once('exit', (code, signal) => finish(code, signal))
