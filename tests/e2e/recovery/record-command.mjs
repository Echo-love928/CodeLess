import { spawn, spawnSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync, openSync, closeSync } from 'node:fs'
import { resolve, join, dirname } from 'node:path'
import { createHash } from 'node:crypto'

const mode = process.argv[2], windows = process.platform === 'win32'
const commands = {
  unit: ['--filter', '@codeless/web', 'test'],
  build: ['--filter', '@codeless/web', 'build'],
  browser: ['--filter', '@codeless/web', 'exec', 'playwright', 'test', '--config', 'playwright.config.ts', 'recovery/flow.spec.ts', 'deploy/flow.spec.ts', '--workers=1'],
  static: ['verify:static'], api: ['verify:api'], runner: ['verify:runner'], e2e: ['verify:e2e'], gate: ['ci:gate'],
}
if (!Object.hasOwn(commands, mode)) throw new Error('Unknown mode')
const stamp = new Date().toISOString().replaceAll(':', '-') + '-' + mode
const directory = resolve('.local-data/d18-b', stamp), evidence = resolve('tests/e2e/recovery/evidence', stamp)
mkdirSync(directory, { recursive: true }); mkdirSync(evidence, { recursive: true })
const env = { ...process.env, CODELESS_MODEL_PROVIDER: 'deterministic-mock', TZ: 'Asia/Shanghai' }
delete env.CODELESS_MODEL_API_KEY; delete env.CODELESS_MODEL_NAME; delete env.CODELESS_PLAYWRIGHT_CHANNEL; delete env.VITE_PUBLICATION_ORIGIN
if (windows) {
  const pathKey = Object.keys(env).find(key => key.toUpperCase() === 'PATH'), previous = env[pathKey] ?? ''
  for (const key of Object.keys(env)) if (key.toUpperCase() === 'PATH') delete env[key]
  env.PATH = resolve('.local-data/d13-b/bin') + ';' + dirname(process.execPath) + ';' + (env.JAVA_HOME ? env.JAVA_HOME + '/bin;' : '') + previous
}
const git = args => spawnSync('git', args, { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 }).stdout
const hash = bytes => 'sha256:' + createHash('sha256').update(bytes).digest('hex')
const files = git(['ls-files', '--cached', '--others', '--exclude-standard', '-z', '--', 'apps/web/src/features', 'tests/e2e/recovery']).split('\0').filter(path => path && !path.includes('/evidence/'))
const metadata = { mode, command: ['corepack', 'pnpm', ...commands[mode]], startedAt: new Date().toISOString(),
  head: git(['rev-parse', 'HEAD']).trim(), changes: git(['status', '--porcelain']).trim(),
  toolchain: { node: process.version, javaHome: env.JAVA_HOME ?? null, pnpm: '12.6.0' },
  sourceDigests: Object.fromEntries(files.map(path => [path, hash(readFileSync(path))])), exitCode: null, signal: null, status: 'RUNNING' }
const originals = new Map()
if (['api', 'e2e', 'gate'].includes(mode)) {
  for (const path of git(['ls-files', '-z']).split('\0').filter(path => path.includes('/evidence/'))) originals.set(path, readFileSync(path))
}
const save = () => {
  writeFileSync(join(directory, 'run.json'), JSON.stringify(metadata, null, 2) + '\n')
  writeFileSync(join(evidence, 'run.json'), JSON.stringify(metadata, null, 2) + '\n')
}
save(); console.log(JSON.stringify({ directory, evidence, status: metadata.status }))
const fd = openSync(join(directory, 'command.log'), 'wx')
const child = spawn(windows ? process.env.ComSpec : 'corepack', windows ? ['/d', '/c', ...metadata.command] : metadata.command.slice(1), { env, windowsHide: true, stdio: ['ignore', fd, fd] })
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
  Object.assign(metadata, { exitCode, signal, completedAt: new Date().toISOString(), status: exitCode === 0 && signal === null ? 'PASSED' : 'FAILED', logPath: join(directory, 'command.log'), logDigest: hash(readFileSync(join(directory, 'command.log'))) })
  save(); console.log(JSON.stringify({ directory, mode, exitCode, signal, status: metadata.status })); process.exitCode = exitCode === 0 && signal === null ? 0 : exitCode || 1
})
