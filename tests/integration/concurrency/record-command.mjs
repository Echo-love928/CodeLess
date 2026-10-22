// Developer-only fixed D20-A commands. Records native exit/signal, HEAD, tested file digests, the raw log, this run's
// JUnit XML and the concurrency evidence under .local-data/d20-a/runs/. No API/runtime shell capability is exposed here.
// Usage: node tests/integration/concurrency/record-command.mjs MODE
//   acceptance | regression | mutation-<version-snapshot|publication-snapshot|publish-lock|owner-key|artifact-pin|convergence>
//   | static | api | runner | e2e | gate
// Every mutation mode is a negative control: it reintroduces one defect (the pre-fix file from the D20-A base commit,
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
const base = 'c5bec0069702e87492f257093cccc9cce3e2e0eb' // origin/main when D20-A started: the pre-fix code.
const api = 'services/api/src/main/java/dev/codeless/api/'
const acceptance = 'ConcurrencyConsistencyTest'
const tests = {
  acceptance,
  // Changed: VersionController list, PublicationService list/deployment. Plus the suites whose queue, cancel,
  // convergence, edit and publication semantics the acceptance class relies on.
  regression: 'VersionHttpIntegrationTest,PublicationIntegrationTest,ProcessRestartRecoveryTest,ApiSecurityMatrixTest,'
    + 'TaskQueueIntegrationTest,RecoveryConvergenceTest,EditLifecycleIntegrationTest,DeploymentRecordsTest',
}
const mutationSets = {
  'mutation-version-snapshot': { revert: [api + 'versions/VersionController.java'],
    expected: ['d20a04VersionListIsOneSnapshotWhileVersionsCommit'] },
  'mutation-publication-snapshot': { revert: [api + 'deploy/PublicationService.java'],
    expected: ['d20a04PublicationListAndDeploymentAreOneSnapshotWhileAWorkerCommits'] },
  'mutation-publish-lock': { anchors: [[api + 'deploy/PublicationService.java', "WHERE id=? AND status='REQUESTED' FOR UPDATE SKIP LOCKED\")",
    "WHERE id=? AND status='REQUESTED' /* MUTATION */\")"]], expected: ['d20aT1EveryPublicationRequestIsOneLogicalPublicationHostedOnce'] },
  'mutation-owner-key': { anchors: [[api + 'deploy/PublicationService.java', '("codeless-publication-v1\\n"+owner+"\\n"+key)',
    '("codeless-publication-v1\\n"+key) /* MUTATION */']], expected: ['d20aT3TwoUsersRacingWithIdenticalKeysShareNoData'] },
  'mutation-artifact-pin': { anchors: [[api + 'deploy/PublicationService.java', '        if(!actual.equals(digest)) throw conflict("PUBLICATION_ARTIFACT_MISMATCH");\n',
    '        // MUTATION: requested digest no longer pinned\n']], expected: ['d20aT4PublishingAnOldVersionDuringEditsKeepsItsFixedHash'] },
  'mutation-convergence': { anchors: [[api + 'recovery/DraftConvergence.java', '        if (code.isEmpty()) return List.of();',
    '        if (code.isEmpty() || true) return List.of(); // MUTATION']],
    expected: ['d20aT2CancelRacingTheReadyCommitNeverOverwritesTheSuccessfulVersion', 'd20aT2CancellingQueuedOrRunningFollowUpsLeavesTheSuccessfulVersionUsable'] },
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
const root = join(repo, '.local-data/d20-a')
const run = join(root, 'runs', `${new Date().toISOString().replaceAll(':', '-')}-${mode}-${randomUUID()}`)
mkdirSync(run, { recursive: true })
const lock = join(root, 'command.lock')
const lockFd = openSync(lock, 'wx') // Never run two Maven/gate commands against the same target directory.
writeFileSync(lockFd, JSON.stringify({ pid: process.pid, run }))
env.CODELESS_CONCURRENCY_EVIDENCE_DIR = join(run, 'concurrency')
const git = (...a) => spawnSync('git', a, { cwd: repo, encoding: 'utf8' })
const head = git('rev-parse', 'HEAD')
if (head.status !== 0) throw new Error('Cannot record the tested Git HEAD')
const scoped = ['services/api/src/main', 'services/api/src/test', 'services/api/pom.xml', 'tests/integration/concurrency']
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
