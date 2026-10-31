import { spawnSync, spawn } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync, readdirSync, existsSync, statSync, openSync, closeSync, copyFileSync, unlinkSync } from 'node:fs'
import { resolve, join, relative } from 'node:path'
import { createHash } from 'node:crypto'
import { javaHome, sampleEnvironment } from '../../../scripts/eval/run-batch.mjs'

const root = resolve(import.meta.dirname, '../../..')
const mode = process.argv[2]
const selected = {
  'cover-red': 'D26CoverCoordinatorTest',
  'cover-green': 'D26CoverCoordinatorTest,CoverHttpIntegrationTest,CoverEntryProofTest,CoverStoreTest,NodeCoverGatewayTest',
  'cover-boundaries': 'D26CoverCoordinatorTest,CoverHttpIntegrationTest,CoverEntryProofTest,CoverStoreTest,NodeCoverGatewayTest,D26ReleaseBoundaryTest',
  boundaries: 'D26ReleaseBoundaryTest',
  affected: 'D25QualityRegressionTest,D25QualityPolicyTest,D25ProposalFeedbackTest,AcceptanceActionsTest,RepairPolicyTest,PlanValidatorTest,PublicationIntegrationTest,VersionHttpIntegrationTest,ApiSecurityMatrixTest',
}
if (!selected[mode] && !['gate', 'static', 'api', 'runner', 'e2e', 'mapping-diagnostic', 'screenshot-diagnostic', 'followup'].includes(mode)) throw Error('Expected a registered D26-A verification mode')
const git = (...args) => {
  const r = spawnSync('git', ['-c', `safe.directory=${root.replaceAll('\\', '/')}`, ...args], { cwd: root, encoding: 'utf8' })
  if (r.status !== 0) throw Error(r.stderr)
  return r.stdout.trim()
}
const hash = bytes => 'sha256:' + createHash('sha256').update(bytes).digest('hex')
let diagnosticCopyCreated = false, diagnosticSource = null
const diagnosticCopy = join(root, 'tests/regression/release-api/.diagnostic-screenshot.mjs')
if (mode === 'screenshot-diagnostic') {
  const source = spawnSync('git', ['-c', `safe.directory=${root.replaceAll('\\', '/')}`, 'show', '30a2474965e823eb734c889a37944807c6bf88c4:tests/e2e/share/screenshot.acceptance.mjs'], { cwd: root })
  if (source.status !== 0 || hash(source.stdout) !== 'sha256:d76e481288b4a63689a693c90a8f1af1640472539e5a2501410cbf4074b6349a') throw Error('Pinned PR89 diagnostic source required')
  if (existsSync(diagnosticCopy) && hash(readFileSync(diagnosticCopy)) !== hash(source.stdout)) throw Error('Preserve the existing modified diagnostic copy')
  diagnosticCopyCreated = !existsSync(diagnosticCopy)
  writeFileSync(diagnosticCopy, source.stdout)
  diagnosticSource = { commit: '30a2474965e823eb734c889a37944807c6bf88c4', sha256: hash(source.stdout) }
}
const stamp = new Date().toISOString().replaceAll(':', '-') + '-' + mode
const output = join(import.meta.dirname, 'evidence', stamp)
const privateRoot = join(root, '.local-data/d26-a/commands', stamp)
mkdirSync(output, { recursive: true }); mkdirSync(privateRoot, { recursive: true })
const jdk = javaHome(process.env)
const env = sampleEnvironment({ base: process.env, mode: 'MOCK', sample: {}, specPath: '', outputDir: '', java: jdk }).env
delete env.CODELESS_EVAL_SAMPLE_FILE; delete env.CODELESS_EVAL_OUTPUT_DIR
delete env.CODELESS_PLAYWRIGHT_CHANNEL
delete env.NODE_OPTIONS; delete env.D26_PROCESS_OBSERVER
env.JAVA_HOME = jdk
const pathKey = Object.keys(env).find(key => key.toLowerCase() === 'path') ?? 'PATH'
env[pathKey] = join(jdk, 'bin') + (process.platform === 'win32' ? ';' : ':') + env[pathKey]
env.NO_PROXY = env.no_proxy = '127.0.0.1,localhost,::1'
env.D26_STAGE_EXITS = join(privateRoot, 'stages.jsonl')
if (mode === 'screenshot-diagnostic') env.CODELESS_SHARE_EVIDENCE_DIR = join(privateRoot, 'screenshot')
if (['runner', 'e2e'].includes(mode) && process.env.CODELESS_D26_OBSERVER === '1') {
  env.D26_PROCESS_OBSERVER = join(privateRoot, 'process-observer')
  env.NODE_OPTIONS = `--import=${new URL('./followup/process-observer.mjs', import.meta.url).href}`
}
const head = git('rev-parse', 'HEAD'), branch = git('branch', '--show-current')
const sources = git('ls-files', '--cached', '--others', '--exclude-standard', '--', 'services/api/src', 'services/api/pom.xml', 'prompts', 'contracts', 'services/runner/src', 'templates', 'package.json', 'pnpm-lock.yaml', 'scripts', 'tests/regression/release-api')
  .split(/\r?\n/).filter(p => p && !p.startsWith('tests/regression/release-api/evidence/'))
const manifest = () => Object.fromEntries(sources.map(p => [p, hash(readFileSync(join(root, p)))]))
const sourceBefore = manifest()
const screenshots = new Map(['gate', 'runner', 'e2e'].includes(mode) ? git('ls-files', '*.png').split(/\r?\n/).filter(Boolean).map(p => [p, readFileSync(join(root, p))]) : [])
const win = process.platform === 'win32'
const command = ['gate', 'mapping-diagnostic', 'screenshot-diagnostic', 'followup'].includes(mode) ? process.execPath : ['static', 'api', 'runner', 'e2e'].includes(mode) ? (win ? (env.ComSpec ?? 'cmd.exe') : 'corepack') : win ? (env.ComSpec ?? 'cmd.exe') : './services/api/mvnw'
const args = mode === 'gate' ? ['--import', new URL('./stage-observer.mjs', import.meta.url).href, 'scripts/ci-gate.mjs']
  : mode === 'mapping-diagnostic' ? ['--test', 'tests/infra/mapping.test.mjs']
  : mode === 'screenshot-diagnostic' ? ['--test', 'tests/regression/release-api/.diagnostic-screenshot.mjs']
  : mode === 'followup' ? ['--test', ...['freeze-portability', 'freeze-cli', 'screenshot-launch-permit', 'screenshot-cleanup-proof', 'process-observer'].map(n => `tests/regression/release-api/${n}.test.mjs`)]
  : ['static', 'api', 'runner', 'e2e'].includes(mode) ? [...(win ? ['/d', '/c', 'corepack'] : []), 'pnpm', 'run', `verify:${mode}`]
  : [...(win ? ['/d', '/c', 'services\\api\\mvnw.cmd'] : []), '-f', 'services/api/pom.xml', `-Dtest=${selected[mode]}`, 'test']
const startedAt = new Date().toISOString()
writeFileSync(join(output, 'started.json'), JSON.stringify({ task: 'D26-A', mode, head, branch, startedAt, command: [command, ...args] }, null, 2))
writeFileSync(join(output, 'source-before.json'), JSON.stringify(sourceBefore, null, 2))
console.log(JSON.stringify({ mode, evidence: relative(root, output), privateLog: relative(root, join(privateRoot, 'command.log')) }))
const fd = openSync(join(privateRoot, 'command.log'), 'wx')
const child = spawn(command, args, { cwd: root, env, windowsHide: true, stdio: ['ignore', fd, fd] })
closeSync(fd)
const result = await new Promise(done => {
  child.once('error', e => done({ exitCode: null, signal: null, launchError: e.code }))
  child.once('close', (exitCode, signal) => done({ exitCode, signal, launchError: null }))
})
const restoredScreenshots = []
for (const [p, bytes] of screenshots) if (!existsSync(join(root, p)) || hash(readFileSync(join(root, p))) !== hash(bytes)) {
  writeFileSync(join(root, p), bytes); restoredScreenshots.push(p)
}
const log = readFileSync(join(privateRoot, 'command.log'))
const junit = [], reports = join(root, 'services/api/target/surefire-reports')
if (existsSync(reports)) for (const name of readdirSync(reports).filter(n => /^TEST-.*\.xml$/.test(n))) {
  const path = join(reports, name)
  if (statSync(path).mtimeMs < Date.parse(startedAt)) continue
  const xml = readFileSync(path, 'utf8'), attributes = xml.match(/<testsuite\b[^>]*>/)?.[0] ?? ''
  junit.push({ ...Object.fromEntries(['name', 'tests', 'failures', 'errors', 'skipped'].map(k => [k, attributes.match(new RegExp(`\\b${k}="([^"]*)"`))?.[1] ?? null])), sha256: hash(readFileSync(path)) })
  copyFileSync(path, join(privateRoot, name))
  const txt = name.replace(/^TEST-/, '').replace(/\.xml$/, '.txt')
  if (existsSync(join(reports, txt))) copyFileSync(join(reports, txt), join(output, txt))
}
for (const subdir of ['d26-release', 'd26-cover']) {
const testEvidence = join(root, `services/api/target/${subdir}/evidence`)
if (existsSync(testEvidence)) for (const name of readdirSync(testEvidence)) {
  const p = join(testEvidence, name)
  if (statSync(p).mtimeMs >= Date.parse(startedAt)) copyFileSync(p, join(output, name))
}
}
const stages = existsSync(env.D26_STAGE_EXITS) ? readFileSync(env.D26_STAGE_EXITS, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse) : []
const sourceBytesUnchanged = JSON.stringify(sourceBefore) === JSON.stringify(manifest())
const report = { task: 'D26-A', mode, head, branch, startedAt, completedAt: new Date().toISOString(), command: [command, ...args], ...result,
  diagnosticProcessObserver: Boolean(env.D26_PROCESS_OBSERVER),
  diagnosticSource,
  status: result.exitCode === 0 && !result.signal && !result.launchError ? 'PASSED' : 'FAILED', stages, junit,
  sourceBytesUnchanged, headUnchanged: head === git('rev-parse', 'HEAD'), restoredScreenshots,
  privateLog: relative(root, join(privateRoot, 'command.log')).replaceAll('\\', '/'), logSha256: hash(log), logBytes: log.length,
  modelProvider: 'deterministic-mock', paidModelCalls: 0, realModelQuality: 'NOT_EVALUATED',
  summaries: log.toString('utf8').split(/\r?\n/).filter(l => /Tests run:|BUILD SUCCESS|BUILD FAILURE|^(?:ℹ |# )(?:tests|pass|fail|skipped) \d+|\[ci-gate\]/.test(l)),
}
writeFileSync(join(output, 'command.json'), JSON.stringify(report, null, 2))
console.log(JSON.stringify({ evidence: relative(root, output), ...result, status: report.status, sourceBytesUnchanged, stages, junit }))
if (diagnosticCopyCreated && hash(readFileSync(diagnosticCopy)) === diagnosticSource.sha256) unlinkSync(diagnosticCopy)
process.exitCode = result.exitCode ?? 1
