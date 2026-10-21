// Developer-only fixed D19-A commands. Records native exit/signal, HEAD, tested file digests, the raw log, this run's
// JUnit XML and the security evidence under .local-data/d19-a/runs/. No API/runtime shell capability is exposed here.
// Usage: node tests/security/api/record-command.mjs MODE
//   acceptance | regression | mutation-<filter|login|errors|ownership|logging|inventory> | static | api | runner | e2e | gate
// Every mutation mode is a negative control: it reintroduces one defect (the pre-fix file from the D19-A base commit,
// or a one-line anchor change), runs the acceptance class, restores the exact bytes and PASSES only if the build failed
// through every expected test.
import { spawn, spawnSync } from 'node:child_process'
import { openSync, closeSync, mkdirSync, writeFileSync, renameSync, readFileSync, unlinkSync, readdirSync, copyFileSync, existsSync, realpathSync, rmSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join, relative } from 'node:path'
import { randomUUID, createHash } from 'node:crypto'

const repo = realpathSync(fileURLToPath(new URL('../../../', import.meta.url)))
const [mode, ...extra] = process.argv.slice(2)
if (extra.length) throw new Error('Usage: record-command.mjs MODE')
const base = '3ec4b99fbc262aef20e72c23cfe34d0da0740ef9' // origin/main when D19-A started: the pre-fix code.
const api = 'services/api/src/main/java/dev/codeless/api/'
const acceptance = 'ApiSecurityMatrixTest'
const tests = {
  acceptance,
  // Changed: AuthFilter, AuthController/LoginAttempts, GlobalExceptionHandler, application.yml session tracking.
  regression: 'AuthIntegrationTest,AuthHttpTest,LoginAttemptsTest,AdminIntegrationTest,ApplicationHttpTest,ApplicationIntegrationTest,'
    + 'TaskHttpTest,TaskSseHttpTest,PreviewHttpTest,PreviewRegistryHttpTest,PreviewTopHttpTest,PreviewCnHttpTest,'
    + 'GlobalExceptionHandlerTest,CsrfDuringGenerationTest,HealthControllerTest',
}
const mutationSets = {
  'mutation-filter': { revert: [api + 'auth/AuthFilter.java'], expected: ['d19aT2WritesCannotBypassCsrf'] },
  'mutation-login': { revert: [api + 'auth/AuthController.java', api + 'auth/LoginAttempts.java'],
    expected: ['d19aLoginLimitHoldsForSpellingsAndConcurrentGuesses'] },
  'mutation-errors': { revert: [api + 'error/GlobalExceptionHandler.java'],
    expected: ['d19aFieldLengthsAndIdempotencyKeysAreEnforced', 'd19aT4IllegalInputCreatesNoExecutableFileOrDeployment'] },
  'mutation-ownership': { anchors: [[api + 'auth/OwnershipGuard.java', 'WHERE v.id = ? AND a.owner_id = ?',
    'WHERE v.id = ? AND (a.owner_id = ? OR true) /* MUTATION */']], expected: ['d19aT1EveryPrivateResourceRejectsAnotherUser'] },
  'mutation-logging': { anchors: [[api + 'auth/AuthController.java', '        if (email.length() > 320 || password.length() > 1024) {',
    '        org.slf4j.LoggerFactory.getLogger(AuthController.class).info("login {} {}", email, password); // MUTATION\n'
      + '        if (email.length() > 320 || password.length() > 1024) {']], expected: ['d19aT3LogsCarryNoSecretOrPassword'] },
  'mutation-inventory': { anchors: [[api + 'auth/AuthController.java', '    @GetMapping("/auth/me")',
    '    @GetMapping("/auth/whoami") public String whoami() { return "unclassified"; } // MUTATION\n\n    @GetMapping("/auth/me")']],
    expected: ['everyRegisteredRouteIsClassifiedInTheSecurityMatrix'] },
}
const mutating = Object.hasOwn(mutationSets, mode)
const mutation = mutating ? mutationSets[mode] : null

let command, args
const windows = process.platform === 'win32'
const target = mutating ? acceptance : tests[mode]
if (target) {
  const maven = ['-f', 'services/api/pom.xml', `-Dtest=${target}`, 'test']
  command = windows ? (process.env.ComSpec ?? 'cmd.exe') : './services/api/mvnw'
  args = windows ? ['/d', '/c', 'services\\api\\mvnw.cmd', ...maven] : maven
} else if (mode === 'gate') {
  command = process.execPath; args = ['scripts/ci-gate.mjs']
} else if (['api', 'static', 'runner', 'e2e'].includes(mode)) {
  command = windows ? (process.env.ComSpec ?? 'cmd.exe') : 'corepack'
  args = windows ? ['/d', '/c', 'corepack', 'pnpm', 'run', `verify:${mode}`] : ['pnpm', 'run', `verify:${mode}`]
} else throw new Error('Unknown fixed command mode')

const env = { ...process.env, CODELESS_MODEL_PROVIDER: 'deterministic-mock' }
for (const key of ['CODELESS_MODEL_API_KEY', 'CODELESS_MODEL_NAME', 'CODELESS_PLAYWRIGHT_CHANNEL']) delete env[key]
const root = join(repo, '.local-data/d19-a')
const run = join(root, 'runs', `${new Date().toISOString().replaceAll(':', '-')}-${mode}-${randomUUID()}`)
mkdirSync(run, { recursive: true })
const lock = join(root, 'command.lock')
const lockFd = openSync(lock, 'wx') // Never run two Maven/gate commands against the same target directory.
writeFileSync(lockFd, JSON.stringify({ pid: process.pid, run }))
env.CODELESS_SECURITY_EVIDENCE_DIR = join(run, 'security')
const git = (...a) => spawnSync('git', a, { cwd: repo, encoding: 'utf8' })
const head = git('rev-parse', 'HEAD')
if (head.status !== 0) throw new Error('Cannot record the tested Git HEAD')
const scoped = ['services/api/src/main', 'services/api/src/test', 'services/api/pom.xml', 'tests/security/api']
const modified = git('diff', '--name-only', '-z', 'HEAD', '--', ...scoped), untracked = git('ls-files', '--others', '--exclude-standard', '-z', '--', ...scoped)
if (modified.status !== 0 || untracked.status !== 0) throw new Error('Cannot record tested file hashes')
const sha = bytes => 'sha256:' + createHash('sha256').update(bytes).digest('hex')
const metadata = { mode, head: head.stdout.trim(), command: [command, ...args], startedAt: new Date().toISOString(), status: 'RUNNING',
  exitCode: null, signal: null, modelProvider: 'deterministic-mock',
  uncommittedScopedFiles: [...new Set((modified.stdout + untracked.stdout).split('\0').filter(Boolean))].map(path => ({ path,
    digest: existsSync(join(repo, path)) ? sha(readFileSync(join(repo, path))) : null })) }
function save() {
  writeFileSync(join(run, 'run.json.pending'), JSON.stringify(metadata, null, 2) + '\n')
  renameSync(join(run, 'run.json.pending'), join(run, 'run.json'))
}

const originals = new Map()
if (mutating) {
  if (metadata.uncommittedScopedFiles.length) throw new Error('mutation modes require a clean committed tree')
  const changes = []
  for (const file of mutation.revert ?? []) {
    const old = spawnSync('git', ['show', `${base}:${file}`], { cwd: repo, encoding: 'buffer', maxBuffer: 1 << 24 })
    if (old.status !== 0) throw new Error(`cannot read ${file} at the base commit`)
    changes.push([join(repo, file), old.stdout])
    metadata.mutations = [...(metadata.mutations ?? []), { file, revertedTo: base, digest: sha(old.stdout) }]
  }
  for (const [file, from, to] of mutation.anchors ?? []) {
    const path = join(repo, file), text = readFileSync(path, 'utf8')
    if (text.split(from).length !== 2) throw new Error(`mutation anchor not unique: ${file}`)
    changes.push([path, Buffer.from(text.replace(from, to))])
    metadata.mutations = [...(metadata.mutations ?? []), { file, from: from.trim(), to: to.trim() }]
  }
  for (const [path, bytes] of changes) {
    if (!originals.has(path)) originals.set(path, readFileSync(path))
    writeFileSync(path, bytes)
  }
}
function restore() {
  for (const [path, bytes] of originals) writeFileSync(path, bytes)
  originals.clear()
}
process.once('SIGINT', () => { restore(); process.exit(130) })
save()
const fd = openSync(join(run, 'command.log'), 'wx')
// Only this run's JUnit reports are copied; stale reports from earlier Maven runs never count as evidence.
if (target || ['api', 'gate'].includes(mode)) rmSync(join(repo, 'services/api/target/surefire-reports'), { recursive: true, force: true })
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
  const maven = Boolean(target) || mode === 'api'
  const reports = join(repo, 'services/api/target/surefire-reports')
  if ((maven || mode === 'gate') && existsSync(reports)) {
    mkdirSync(join(run, 'junit'), { recursive: true })
    for (const name of readdirSync(reports).filter(name => /\.(xml|txt)$/.test(name))) copyFileSync(join(reports, name), join(run, 'junit', name))
  }
  if (mutating) {
    // Negative control: the build must fail, and through every expected test.
    const failed = failedTests(join(run, 'junit'))
    metadata.failedTests = failed
    metadata.expectedFailures = mutation.expected
    metadata.completionVerified = code !== 0 && mutation.expected.every(name => failed.includes(name))
    metadata.restoredDigests = [...new Set(metadata.mutations.map(m => m.file))].map(file => ({ file,
      digest: sha(readFileSync(join(repo, file))), matchesHead: git('diff', '--quiet', 'HEAD', '--', file).status === 0 }))
    metadata.status = error ? 'LAUNCH_FAILED' : metadata.completionVerified && metadata.restoredDigests.every(d => d.matchesHead) ? 'PASSED' : 'FAILED'
  } else {
    const marker = maven ? log.includes('[INFO] BUILD SUCCESS') : mode === 'gate' ? log.includes('[ci-gate] all stages passed') : true
    metadata.completionVerified = marker
    metadata.status = error ? 'LAUNCH_FAILED' : code === 0 && signal === null ? marker ? 'PASSED' : 'INCOMPLETE' : 'FAILED'
  }
  if (error) metadata.launchError = error.code ?? 'UNKNOWN'
  metadata.logDigest = sha(log)
  save()
  closeSync(lockFd); unlinkSync(lock)
  console.log(JSON.stringify({ status: metadata.status, exitCode: code, signal, run: relative(repo, run) }))
  process.exitCode = metadata.status === 'PASSED' ? 0 : Number.isInteger(code) && code !== 0 ? code : 1
}
child.once('error', error => finish(null, null, error))
child.once('exit', (code, signal) => finish(code, signal))
