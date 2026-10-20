import { spawn, spawnSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync, openSync, closeSync } from 'node:fs'
import { resolve, join, dirname } from 'node:path'
import { createHash } from 'node:crypto'

const mode = process.argv[2], windows = process.platform === 'win32'
const commands = {
  unit: ['corepack', 'pnpm', '--filter', '@codeless/web', 'exec', 'vitest', 'run', 'src/features/admin'],
  'auth-http': ['python', 'tests/e2e/admin/auth_http.py'],
  live: ['python', 'tests/e2e/admin/live_harness.py'],
  contracts: ['node', 'tests/admin/validate-contract.mjs'],
  browser: ['corepack', 'pnpm', '--filter', '@codeless/web', 'exec', 'playwright', 'test', '--config', 'playwright.config.ts', 'admin/flow.spec.ts'],
  static: ['corepack', 'pnpm', 'verify:static'], api: ['corepack', 'pnpm', 'verify:api'],
  runner: ['corepack', 'pnpm', 'verify:runner'], e2e: ['corepack', 'pnpm', 'verify:e2e'], gate: ['corepack', 'pnpm', 'ci:gate'],
}
commands.build = ['corepack', 'pnpm', '--filter', '@codeless/web', 'build']
if (!Object.hasOwn(commands, mode)) throw new Error('Unknown mode')
const directory = resolve(process.env.CODELESS_ADMIN_INTEGRATION === '1' ? '.local-data/d17-b/integration/runs' : '.local-data/d17-b', new Date().toISOString().replaceAll(':', '-') + '-' + mode)
mkdirSync(directory, { recursive: true })
const env = { ...process.env, CODELESS_MODEL_PROVIDER: 'deterministic-mock', TZ: 'Asia/Shanghai' }
delete env.CODELESS_MODEL_API_KEY; delete env.CODELESS_MODEL_NAME; delete env.CODELESS_PLAYWRIGHT_CHANNEL; delete env.VITE_PUBLICATION_ORIGIN
if (windows) {
  const pathKey = Object.keys(env).find(key => key.toUpperCase() === 'PATH'), previous = env[pathKey] ?? ''
  for (const key of Object.keys(env)) if (key.toUpperCase() === 'PATH') delete env[key]
  env.PATH = resolve('.local-data/d13-b/bin') + ';' + dirname(process.execPath) + ';' + (env.JAVA_HOME ? env.JAVA_HOME + '/bin;' : '') + previous
}
const git = args => spawnSync('git', args, { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 }).stdout
const digest = bytes => 'sha256:' + createHash('sha256').update(bytes).digest('hex')
const sourcePaths = git(['ls-files', '--cached', '--others', '--exclude-standard', '-z', '--', 'apps/web/src/features/admin', 'apps/web/src/router.ts', 'tests/e2e/admin']).split('\0').filter(path => path && !path.includes('/evidence/'))
const metadata = { command: commands[mode], mode, startedAt: new Date().toISOString(), status: 'RUNNING', exitCode: null, signal: null,
  head: git(['rev-parse', 'HEAD']).trim(), changes: git(['status', '--porcelain']).trim(), toolchain: { node: process.version, javaHome: env.JAVA_HOME ?? null, pnpm: '12.6.0' },
  sourceDigests: Object.fromEntries(sourcePaths.map(path => [path, digest(readFileSync(path))])) }
const originals = new Map()
if (['api', 'e2e', 'gate'].includes(mode)) {
  for (const path of git(['ls-files', '-z']).split('\0').filter(path => path.includes('/evidence/'))) originals.set(path, readFileSync(path))
}
const save = () => writeFileSync(join(directory, 'run.json'), JSON.stringify(metadata, null, 2) + '\n')
save(); console.log(JSON.stringify({ directory, status: 'RUNNING' }))
const fd = openSync(join(directory, 'command.log'), 'wx')
const child = spawn(windows ? process.env.ComSpec : commands[mode][0], windows ? ['/d', '/c', ...commands[mode]] : commands[mode].slice(1), { env, windowsHide: true, stdio: ['ignore', fd, fd] })
child.once('error', error => { metadata.launchError = error.message })
child.once('close', (exitCode, signal) => {
  closeSync(fd); metadata.generatedHistoricalEvidence = []
  for (const [path, original] of originals) {
    const generated = readFileSync(path)
    if (generated.equals(original)) continue
    const destination = join(directory, 'generated-history', path)
    mkdirSync(dirname(destination), { recursive: true }); writeFileSync(destination, generated)
    writeFileSync(path, original); metadata.generatedHistoricalEvidence.push(path)
  }
  Object.assign(metadata, { exitCode, signal, completedAt: new Date().toISOString(), status: exitCode === 0 && signal === null ? 'PASSED' : 'FAILED', logDigest: digest(readFileSync(join(directory, 'command.log'))) })
  save(); console.log(JSON.stringify({ directory, mode, exitCode, signal, status: metadata.status })); process.exitCode = exitCode === 0 && signal === null ? 0 : exitCode || 1
})
