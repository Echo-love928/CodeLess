import { spawn, spawnSync } from 'node:child_process'
import { mkdirSync, openSync, closeSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { createHash } from 'node:crypto'

const mode = process.argv[2]
const commands = {
  unit: ['--filter', '@codeless/web', 'exec', 'vitest', 'run', 'src/features/visual-edit/selector-session.test.ts', 'src/features/preview/PreviewPanel.test.ts'],
  browser: ['--filter', '@codeless/web', 'exec', 'playwright', 'test', '--config', 'playwright.config.ts', 'selector/flow.spec.ts', '--workers=1'],
  static: ['verify:static'], api: ['verify:api'], runner: ['verify:runner'], e2e: ['verify:e2e'], gate: ['ci:gate'],
}
if (!Object.hasOwn(commands, mode)) throw new Error('Unknown recording mode')
const directory = resolve('.local-data/d13-b', new Date().toISOString().replaceAll(':', '-') + '-' + mode)
mkdirSync(directory, { recursive: true })
const env = { ...process.env, CODELESS_MODEL_PROVIDER: 'deterministic-mock', JAVA_HOME: process.env.JAVA_HOME }
if (process.platform === 'win32') {
  const pathKey = Object.keys(env).find(key => key.toUpperCase() === 'PATH')
  const oldPath = env[pathKey] ?? ''
  for (const key of Object.keys(env)) if (key.toUpperCase() === 'PATH') delete env[key]
  env.PATH = resolve('.local-data/d13-b/bin') + ';' + resolve(process.execPath, '..') + ';' + (env.JAVA_HOME ? env.JAVA_HOME + '/bin;' : '') + oldPath
}
delete env.CODELESS_MODEL_API_KEY; delete env.CODELESS_PLAYWRIGHT_CHANNEL
const head = spawnSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' })
const status = spawnSync('git', ['status', '--porcelain'], { encoding: 'utf8' })
const command = process.platform === 'win32' ? process.env.ComSpec : 'corepack'
const args = [...(process.platform === 'win32' ? ['/d', '/c', 'corepack'] : []), 'pnpm', ...commands[mode]]
const metadata = { mode, command: ['corepack', 'pnpm', ...commands[mode]], head: head.stdout.trim(), changes: status.stdout.trim(),
  startedAt: new Date().toISOString(), status: 'RUNNING', exitCode: null, signal: null }
const save = () => writeFileSync(join(directory, 'run.json'), JSON.stringify(metadata, null, 2) + '\n')
save(); console.log(JSON.stringify({ directory, status: 'RUNNING' }))
const fd = openSync(join(directory, 'command.log'), 'wx')
const child = spawn(command, args, { env, windowsHide: true, stdio: ['ignore', fd, fd] })
let finished = false
function finish(code, signal, error) {
  if (finished) return
  finished = true; closeSync(fd)
  Object.assign(metadata, { completedAt: new Date().toISOString(), exitCode: code, signal, status: error ? 'LAUNCH_FAILED' : code === 0 && signal === null ? 'PASSED' : 'FAILED',
    logDigest: 'sha256:' + createHash('sha256').update(readFileSync(join(directory, 'command.log'))).digest('hex') })
  if (error) metadata.error = error.code ?? 'UNKNOWN'
  save(); console.log(JSON.stringify(metadata)); process.exitCode = code === 0 && !signal && !error ? 0 : code || 1
}
child.once('error', error => finish(null, null, error))
child.once('close', (code, signal) => finish(code, signal))
