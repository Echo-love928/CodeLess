// Developer-only fixed acceptance commands. No API/runtime shell capability is exposed.
import { spawn, spawnSync } from 'node:child_process'
import { openSync, closeSync, mkdirSync, writeFileSync, renameSync, readFileSync, realpathSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { resolve, relative, isAbsolute, join } from 'node:path'
import { randomUUID, createHash } from 'node:crypto'

const workspace = realpathSync(fileURLToPath(new URL('../../../', import.meta.url)))
const [mode, ...options] = process.argv.slice(2)
if (options.length && (options.length !== 2 || options[0] !== '--repo')) throw new Error('Usage: record-command.mjs MODE [--repo workspace-subdirectory]')
const repo = realpathSync(options.length ? resolve(workspace, options[1]) : workspace)
const part = relative(workspace, repo)
if (part.startsWith('..') || isAbsolute(part)) throw new Error('Review repository must stay within the authorized workspace')
const tests = {
  acceptance: 'EditLifecycleIntegrationTest',
  'cleanup-diagnostic': 'OwnedWorkspaceCleanupTest,FileToolsIntegrationTest#workspaceRootAncestorLinkAndUnexpectedProtectedFilesFailClosed',
}
let command, args, cwd = repo
if (Object.hasOwn(tests, mode)) {
  const maven = ['-f', 'services/api/pom.xml', `-Dtest=${tests[mode]}`, 'test']
  command = process.platform === 'win32' ? (process.env.ComSpec ?? 'cmd.exe') : './services/api/mvnw'
  args = process.platform === 'win32' ? ['/d', '/c', 'services\\api\\mvnw.cmd', ...maven] : maven
} else if (mode === 'contracts') {
  command = process.execPath; args = ['--test', 'tests/edit/lifecycle/contracts.test.mjs']
} else if (mode === 'gate') {
  command = process.execPath; args = ['scripts/ci-gate.mjs']
} else if (mode === 'api') {
  command = process.platform === 'win32' ? (process.env.ComSpec ?? 'cmd.exe') : 'corepack'
  args = process.platform === 'win32' ? ['/d', '/c', 'corepack', 'pnpm', 'run', 'verify:api'] : ['pnpm', 'run', 'verify:api']
} else throw new Error('Mode must be acceptance, cleanup-diagnostic, contracts, api or gate')
const env = { ...process.env, CODELESS_MODEL_PROVIDER: 'deterministic-mock' }
for (const key of ['CODELESS_MODEL_API_KEY', 'CODELESS_MODEL_NAME', 'CODELESS_PLAYWRIGHT_CHANNEL']) delete env[key]
const run = join(workspace, '.local-data/d12-a/runs', `${new Date().toISOString().replaceAll(':', '-')}-${mode}-${randomUUID()}`)
mkdirSync(run, { recursive: true })
env.CODELESS_EDIT_EVIDENCE_DIR = join(run, 'edit')
env.CODELESS_VERSION_PREVIEW_EVIDENCE_DIR = join(run, 'preview')
const head = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: repo, encoding: 'utf8' })
if (head.status !== 0) throw new Error('Cannot record the tested Git HEAD')
const changes = spawnSync('git', ['status', '--porcelain', '--', 'services/api/src/test', 'tests/edit/lifecycle'], { cwd: repo, encoding: 'utf8' })
const metadata = { mode, head: head.stdout.trim(), repository: relative(workspace, repo) || '.',
  uncommittedTestChanges: changes.status === 0 ? changes.stdout.trim().split('\n').filter(Boolean) : null,
  command: [command, ...args], cwd: relative(workspace, cwd) || '.', startedAt: new Date().toISOString(), status: 'RUNNING', exitCode: null,
  signal: null, modelProvider: 'deterministic-mock', browserChannel: 'locked bundled Chromium' }
function save() {
  writeFileSync(join(run, 'run.json.pending'), JSON.stringify(metadata, null, 2) + '\n')
  renameSync(join(run, 'run.json.pending'), join(run, 'run.json'))
}
save()
const fd = openSync(join(run, 'command.log'), 'wx')
console.log(JSON.stringify({ status: 'RUNNING', run: relative(workspace, run) }))
// Direct file descriptors avoid waiting for EOF on pipes inherited by browser/process descendants.
const child = spawn(command, args, { cwd, env, stdio: ['ignore', fd, fd], shell: false })
let completed = false
function finish(code, signal, error) {
  if (completed) return
  completed = true; closeSync(fd)
  metadata.completedAt = new Date().toISOString(); metadata.exitCode = code; metadata.signal = signal
  metadata.status = error ? 'LAUNCH_FAILED' : code === 0 && signal === null ? 'PASSED' : 'FAILED'
  if (error) metadata.launchError = error.code ?? 'UNKNOWN'
  metadata.logDigest = 'sha256:' + createHash('sha256').update(readFileSync(join(run, 'command.log'))).digest('hex')
  save()
  console.log(JSON.stringify({ status: metadata.status, exitCode: code, signal, run: relative(workspace, run) }))
  process.exitCode = code === 0 && signal === null && !error ? 0 : Number.isInteger(code) && code !== 0 ? code : 1
}
child.once('error', error => finish(null, null, error))
child.once('exit', (code, signal) => finish(code, signal))
