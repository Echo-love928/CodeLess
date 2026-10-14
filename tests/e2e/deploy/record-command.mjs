import { spawn, spawnSync } from 'node:child_process'
import { mkdirSync, openSync, closeSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { createHash } from 'node:crypto'

const mode = process.argv[2], windows = process.platform === 'win32'
const commands = {
  unit: ['corepack', 'pnpm', '--filter', '@codeless/web', 'exec', 'vitest', 'run', 'src/features/deploy'],
  boundary: ['node', '--test', 'tests/e2e/deploy/publisher.test.mjs'],
  hosting: ['node', '--test', 'tests/e2e/deploy/hosting.acceptance.mjs'],
  browser: ['corepack', 'pnpm', '--filter', '@codeless/web', 'exec', 'playwright', 'test', '--config', 'playwright.config.ts', 'deploy/flow.spec.ts', '--workers=1'],
  static: ['corepack', 'pnpm', 'verify:static'], api: ['corepack', 'pnpm', 'verify:api'],
  'api-repro': [windows ? 'services\\api\\mvnw.cmd' : './services/api/mvnw', '-f', 'services/api/pom.xml', '-Dtest=PreviewPlatformIntegrationTest', 'test'],
  'e2e-repro': ['corepack', 'pnpm', '--filter', '@codeless/web', 'exec', 'playwright', 'test', '--config', 'playwright.config.ts', '--workers=1', 'auth/flow.spec.ts', 'apps/flow.spec.ts', 'runner/browser.spec.ts'],
  'e2e-bounded': ['corepack', 'pnpm', 'verify:e2e', '--workers=4'],
  runner: ['corepack', 'pnpm', 'verify:runner'], e2e: ['corepack', 'pnpm', 'verify:e2e'], gate: ['corepack', 'pnpm', 'ci:gate'],
}
if (!Object.hasOwn(commands, mode)) throw new Error('unknown recording mode')
const directory = resolve('.local-data/d15-b', new Date().toISOString().replaceAll(':', '-') + '-' + mode)
mkdirSync(directory, { recursive: true })
const env = { ...process.env, VITE_PUBLICATION_ORIGIN: 'https://sites.codeless-public.test', CODELESS_MODEL_PROVIDER: 'deterministic-mock', CODELESS_DEPLOY_EVIDENCE_DIR: join(directory, 'hosting') }
delete env.CODELESS_MODEL_API_KEY; delete env.CODELESS_MODEL_NAME; delete env.CODELESS_PLAYWRIGHT_CHANNEL
// Exercise the same config-free build as CI; deploy UI tests supply operator-owned static config.
if (['e2e', 'e2e-bounded', 'e2e-repro'].includes(mode)) delete env.VITE_PUBLICATION_ORIGIN
if (windows) {
  const pathKey = Object.keys(env).find(key => key.toUpperCase() === 'PATH'), prior = env[pathKey] ?? ''
  for (const key of Object.keys(env)) if (key.toUpperCase() === 'PATH') delete env[key]
  env.PATH = resolve('.local-data/d13-b/bin') + ';' + resolve(process.execPath, '..') + ';' + (env.JAVA_HOME ? env.JAVA_HOME + '/bin;' : '') + prior
}
const metadata = { mode, command: commands[mode], startedAt: new Date().toISOString(), exitCode: null, signal: null,
  head: spawnSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).stdout.trim(),
  changes: spawnSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).stdout.trim() }
// Existing stage tests regenerate historical tracked evidence. Retain their new bytes privately,
// then restore the exact pre-run evidence bytes; never reset source files or pre-existing edits.
const originals = new Map()
if (['api', 'api-repro', 'e2e', 'e2e-bounded', 'e2e-repro', 'gate'].includes(mode)) {
  const paths = spawnSync('git', ['ls-files', '-z'], { encoding: 'utf8' }).stdout.split('\0').filter(path => path.includes('/evidence/') && !path.startsWith('tests/e2e/deploy/'))
  for (const path of paths) originals.set(path, readFileSync(path))
}
const save = () => writeFileSync(join(directory, 'run.json'), JSON.stringify(metadata, null, 2))
save(); console.log(JSON.stringify({ directory, status: 'RUNNING' }))
const fd = openSync(join(directory, 'command.log'), 'wx')
const child = spawn(windows ? process.env.ComSpec : commands[mode][0], windows ? ['/d', '/c', ...commands[mode]] : commands[mode].slice(1),
  { env, windowsHide: true, stdio: ['ignore', fd, fd] })
child.once('error', error => { metadata.launchError = error.message })
child.once('close', (code, signal) => {
  closeSync(fd)
  metadata.generatedHistoricalEvidence = []
  for (const [path, bytes] of originals) {
    const generated = readFileSync(path)
    if (generated.equals(bytes)) continue
    const destination = join(directory, 'generated-history', path)
    mkdirSync(resolve(destination, '..'), { recursive: true }); writeFileSync(destination, generated)
    writeFileSync(path, bytes); metadata.generatedHistoricalEvidence.push(path)
  }
  Object.assign(metadata, { exitCode: code, signal, completedAt: new Date().toISOString(), status: code === 0 && signal === null ? 'PASSED' : 'FAILED',
    logDigest: 'sha256:' + createHash('sha256').update(readFileSync(join(directory, 'command.log'))).digest('hex') })
  save(); console.log(JSON.stringify(metadata)); process.exitCode = code === 0 && signal === null ? 0 : code || 1
})
