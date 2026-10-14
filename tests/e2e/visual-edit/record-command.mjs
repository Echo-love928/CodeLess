import { spawn, spawnSync } from 'node:child_process'
import { mkdirSync, openSync, closeSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { createHash } from 'node:crypto'

const mode = process.argv[2]
const commands = {
  unit: ['--filter', '@codeless/web', 'exec', 'vitest', 'run', 'src/features/visual-edit', 'src/features/versions'],
  browser: ['--filter', '@codeless/web', 'exec', 'playwright', 'test', '--config', 'playwright.config.ts', 'visual-edit/flow.spec.ts', 'selector/flow.spec.ts', '--workers=1', '--reporter=list,json'],
  static: ['verify:static'], api: ['verify:api'], runner: ['verify:runner'], e2e: ['verify:e2e'], gate: ['ci:gate'],
  integration: [],
}
if (!Object.hasOwn(commands, mode)) throw new Error('Unknown mode')
const directory = resolve('.local-data/d14-b', new Date().toISOString().replaceAll(':', '-') + '-' + mode)
mkdirSync(directory, { recursive: true })
const env = { ...process.env, CODELESS_MODEL_PROVIDER: 'deterministic-mock' }
delete env.CODELESS_MODEL_API_KEY; delete env.CODELESS_MODEL_NAME; delete env.CODELESS_PLAYWRIGHT_CHANNEL
if (process.platform === 'win32') {
  const pathKey = Object.keys(env).find(key => key.toUpperCase() === 'PATH')
  const oldPath = env[pathKey] ?? ''
  for (const key of Object.keys(env)) if (key.toUpperCase() === 'PATH') delete env[key]
  env.PATH = resolve('.local-data/d13-b/bin') + ';' + resolve(process.execPath, '..') + ';' + (env.JAVA_HOME ? env.JAVA_HOME + '/bin;' : '') + oldPath
}
const windows = process.platform === 'win32'
const repository = mode === 'integration' ? resolve('.local-data/d14-ab-integration') : process.cwd()
if (mode === 'browser') env.PLAYWRIGHT_JSON_OUTPUT_NAME = join(directory, 'browser-results.json')
const invocation = mode === 'integration' ? [windows ? 'services\\api\\mvnw.cmd' : './services/api/mvnw', '-f', 'services/api/pom.xml', '-Dtest=EditVerificationIntegrationTest,PreviewPlatformIntegrationTest', 'test'] : ['corepack', 'pnpm', ...commands[mode]]
env.CODELESS_EDIT_VERIFICATION_EVIDENCE_DIR = join(directory, 'verification')
env.CODELESS_VERSION_PREVIEW_EVIDENCE_DIR = join(directory, 'preview')
const metadata = { mode, command: invocation, repository, head: spawnSync('git', ['rev-parse', 'HEAD'], { cwd: repository, encoding: 'utf8' }).stdout.trim(),
  changes: spawnSync('git', ['status', '--porcelain'], { cwd: repository, encoding: 'utf8' }).stdout.trim(),
  startedAt: new Date().toISOString(), status: 'RUNNING', exitCode: null, signal: null }
if (mode === 'integration') {
  metadata.provenance = JSON.parse(readFileSync(resolve('.local-data/d14-b/integration-source.json'), 'utf8'))
  const changed = spawnSync('git', ['diff', '--name-only', '-z', 'HEAD'], { cwd: repository, encoding: 'utf8' }).stdout
  const added = spawnSync('git', ['ls-files', '--others', '--exclude-standard', '-z'], { cwd: repository, encoding: 'utf8' }).stdout
  metadata.testedFileDigests = [...new Set((changed + added).split('\0').filter(Boolean))].map(path => ({ path,
    digest: 'sha256:' + createHash('sha256').update(readFileSync(join(repository, path))).digest('hex') }))
}
const save = () => writeFileSync(join(directory, 'run.json'), JSON.stringify(metadata, null, 2) + '\n')
save(); console.log(JSON.stringify({ directory, status: 'RUNNING' }))
const fd = openSync(join(directory, 'command.log'), 'wx')
const child = spawn(windows ? process.env.ComSpec : invocation[0], windows ? ['/d', '/c', ...invocation] : invocation.slice(1), { cwd: repository, env, windowsHide: true, stdio: ['ignore', fd, fd] })
let finished = false
function finish(code, signal, error) {
  if (finished) return
  finished = true; closeSync(fd)
  Object.assign(metadata, { completedAt: new Date().toISOString(), exitCode: code, signal,
    status: error ? 'LAUNCH_FAILED' : code === 0 && signal === null ? 'PASSED' : 'FAILED',
    logDigest: 'sha256:' + createHash('sha256').update(readFileSync(join(directory, 'command.log'))).digest('hex') })
  if (mode === 'integration') {
    metadata.completionVerified = readFileSync(join(directory, 'command.log'), 'utf8').includes('[INFO] BUILD SUCCESS')
    if (metadata.status === 'PASSED' && !metadata.completionVerified) metadata.status = 'INCOMPLETE'
  }
  if (error) metadata.error = error.code ?? 'UNKNOWN'
  save(); console.log(JSON.stringify(metadata)); process.exitCode = metadata.status === 'PASSED' ? 0 : code || 1
}
child.once('error', error => finish(null, null, error)); child.once('close', (code, signal) => finish(code, signal))
