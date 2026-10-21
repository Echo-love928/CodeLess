import { spawn, spawnSync } from 'node:child_process'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { resolve, join } from 'node:path'
import { createWriteStream } from 'node:fs'

const mode = process.argv[2]
const commands = {
  store: [process.execPath, ['--test', 'tests/security/runner/store.test.mjs']],
  security: [process.execPath, ['--test', 'tests/infra/security-runner.test.mjs']],
  gate: [process.execPath, ['scripts/ci-gate.mjs']],
  static: ['pnpm', ['verify:static']], api: ['pnpm', ['verify:api']],
  runner: ['pnpm', ['verify:runner']], e2e: ['pnpm', ['verify:e2e']],
}
if (!Object.hasOwn(commands, mode)) throw new Error('unknown recording mode')
const startedAt = new Date().toISOString(), directory = resolve('.local-data/d19-b', startedAt.replaceAll(':', '-') + '-' + mode)
await mkdir(directory, { recursive: true })
const env = { ...process.env, CODELESS_MODEL_PROVIDER: 'deterministic-mock', CODELESS_SECURITY_EVIDENCE_DIR: join(directory, 'results') }
for (const key of ['CODELESS_MODEL_API_KEY', 'OPENAI_API_KEY', 'ANTHROPIC_API_KEY', 'CODELESS_PLAYWRIGHT_CHANNEL', 'HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY']) delete env[key]
if (process.platform === 'win32') {
  const previous = Object.entries(env).find(([key]) => key.toUpperCase() === 'PATH')?.[1] ?? ''
  for (const key of Object.keys(env)) if (key.toUpperCase() === 'PATH') delete env[key]
  env.PATH = resolve('.local-data/d19-b/bin') + ';' + resolve(process.execPath, '..') + ';' + (env.JAVA_HOME ? env.JAVA_HOME + '/bin;' : '') + previous
}
let [command, args] = commands[mode]
if (command === 'pnpm' && process.platform === 'win32') { command = 'cmd.exe'; args = ['/d', '/s', '/c', 'pnpm', ...args] }
const revision = spawnSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).stdout.trim()
const status = spawnSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).stdout
const tracked = spawnSync('git', ['ls-files', 'services/runner', 'infra', 'tests/security/runner', 'tests/infra/security-runner.test.mjs', '--cached', '--others', '--exclude-standard'], { encoding: 'utf8' }).stdout.trim().split(/\r?\n/)
const sources = {}
for (const path of new Set(tracked.filter(Boolean))) sources[path] = createHash('sha256').update(await readFile(path)).digest('hex')
const output = []
const originals = new Map()
if (['gate', 'e2e', 'api', 'runner'].includes(mode)) {
  const paths = spawnSync('git', ['ls-files', '-z'], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 }).stdout.split('\0')
  for (const path of paths.filter(path => path.includes('/evidence/'))) originals.set(path, await readFile(path))
}
const log = createWriteStream(join(directory, 'command.log'), { flags: 'wx' })
await writeFile(join(directory, 'run.json'), JSON.stringify({ mode, command, args, startedAt, revision, status, sources, exitCode: null, state: 'RUNNING' }, null, 2))
console.log(JSON.stringify({ directory, mode, state: 'RUNNING' }))
const child = spawn(command, args, { env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
for (const stream of [child.stdout, child.stderr]) stream.on('data', bytes => { output.push(bytes); log.write(bytes) })
child.once('error', error => output.push(Buffer.from(error.message)))
child.once('close', async (exitCode, signal) => {
  const bytes = Buffer.concat(output)
  await new Promise(done => log.end(done))
  const restoredHistory = []
  for (const [path, original] of originals) {
    const generated = await readFile(path)
    if (generated.equals(original)) continue
    const destination = join(directory, 'generated-history', path)
    await mkdir(resolve(destination, '..'), { recursive: true }); await writeFile(destination, generated)
    await writeFile(path, original); restoredHistory.push(path)
  }
  const result = { mode, command, args, startedAt, completedAt: new Date().toISOString(), revision, status, sources,
    exitCode, signal, restoredHistory, logSha256: createHash('sha256').update(bytes).digest('hex'), modelProvider: 'deterministic-mock', realModelCalls: 0 }
  await writeFile(join(directory, 'run.json'), JSON.stringify(result, null, 2))
  console.log(JSON.stringify({ directory, exitCode, signal, tail: bytes.toString('utf8').slice(-5000) }, null, 2))
  process.exitCode = exitCode ?? 1
})
