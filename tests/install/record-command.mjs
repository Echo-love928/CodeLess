// Fixed developer acceptance commands only; no shell/task-provided commands.
// Raw logs remain private. JSON records exit/signal and hashes, never environment values.
import { spawn, spawnSync } from 'node:child_process'
import { once } from 'node:events'
import { mkdirSync, openSync, closeSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { join, resolve, relative } from 'node:path'
import { createHash, randomUUID } from 'node:crypto'
import { environment, root, windows } from '../e2e/full/support.mjs'

const [mode, archive] = process.argv.slice(2)
const env = environment()
const dir = join(root, '.local-data/d23-b/commands', new Date().toISOString().replaceAll(':', '-') + '-' + mode + '-' + randomUUID())
mkdirSync(dir, { recursive: true })
const java = join(env.JAVA_HOME, 'bin', windows ? 'java.exe' : 'java')
const commands = {
  install: ['corepack', 'pnpm', 'install', '--frozen-lockfile'],
  docs: [process.execPath, '--test', 'tests/install/install.test.mjs'],
  config: [process.execPath, 'infra/check-config.mjs', '.env.example'],
  compose: ['docker', 'compose', '--env-file', '.env.example', '-f', 'infra/compose.dev.yml', '-p', 'codeless-d23-doc-check', 'config', '--quiet'],
  full: [process.execPath, 'tests/e2e/full/record-command.mjs', 'full'],
  real: [java, '-Dloader.main=dev.codeless.api.model.PlanAcceptanceCli', '-cp', 'services/api/target/codeless-api-0.0.0-SNAPSHOT.jar', 'org.springframework.boot.loader.launch.PropertiesLauncher', join(dir, 'model')],
  'real-missing': [java, '-Dloader.main=dev.codeless.api.model.PlanAcceptanceCli', '-cp', 'services/api/target/codeless-api-0.0.0-SNAPSHOT.jar', 'org.springframework.boot.loader.launch.PropertiesLauncher', join(dir, 'model')],
  export: [process.execPath, 'tests/export/clean-build.mjs', archive ?? '', join(dir, 'clean')],
  static: [process.execPath, 'tests/e2e/full/record-command.mjs', 'static'],
  api: [process.execPath, 'tests/e2e/full/record-command.mjs', 'api'],
  runner: [process.execPath, 'tests/e2e/full/record-command.mjs', 'runner'],
  e2e: [process.execPath, 'tests/e2e/full/record-command.mjs', 'e2e'],
  gate: [process.execPath, 'tests/e2e/full/record-command.mjs', 'gate']
}
if (!Object.hasOwn(commands, mode) || (archive && mode !== 'export') || process.argv.length > 4) throw new Error('Expected install/docs/config/compose/full/real/real-missing/export <zip>/static/api/runner/e2e/gate')
if (mode === 'export' && (!archive || !existsSync(resolve(archive)))) throw new Error('Existing downloaded ZIP required')
if (mode === 'real') for (const key of ['CODELESS_MODEL_API_KEY', 'CODELESS_MODEL_NAME']) if (process.env[key]) env[key] = process.env[key]
const git = (...args) => {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf8', windowsHide: true })
  if (result.status !== 0) throw new Error('Cannot read Git identity')
  return result.stdout.trim()
}
const sha = bytes => 'sha256:' + createHash('sha256').update(bytes).digest('hex')
const report = { task: 'D23-B', mode, startedAt: new Date().toISOString(), status: 'RUNNING',
  revision: git('rev-parse', 'HEAD'), changes: git('status', '--porcelain'), node: process.version,
  command: commands[mode].map(p => p.startsWith(root) ? relative(root, p) : p), exitCode: null, signal: null,
  modelProvider: mode.startsWith('real') ? 'deepseek' : 'deterministic-mock',
  sources: Object.fromEntries(['README.md', 'docs/install.md', 'docs/troubleshooting.md', '.env.example', 'package.json', 'pnpm-lock.yaml', 'tests/install/install.test.mjs', 'tests/install/record-command.mjs'].map(p => [p, sha(readFileSync(join(root, p)))])) }
const save = () => writeFileSync(join(dir, 'run.json'), JSON.stringify(report, null, 2) + '\n')
save()
console.log(JSON.stringify({ mode, status: report.status, output: relative(root, dir) }))
const fd = openSync(join(dir, 'command.log'), 'wx'), [command, ...args] = commands[mode]
const shell = windows && command === 'corepack'
const child = spawn(shell ? process.env.ComSpec : command, shell ? ['/d', '/c', command, ...args] : args, { cwd: root, env, windowsHide: true, stdio: ['ignore', fd, fd] })
try { [report.exitCode, report.signal] = await once(child, 'close') }
catch (error) { report.launchError = error.code ?? 'UNKNOWN' }
finally {
  closeSync(fd)
  report.status = report.exitCode === 0 && !report.signal ? 'PASSED' : mode.startsWith('real') && report.exitCode === 2 ? 'BLOCKED' : 'FAILED'
  report.completedAt = new Date().toISOString()
  report.logDigest = sha(readFileSync(join(dir, 'command.log')))
  report.changedSources = Object.entries(report.sources).filter(([p, digest]) => sha(readFileSync(join(root, p))) !== digest).map(([p]) => p)
  save()
  console.log(JSON.stringify({ mode, status: report.status, exitCode: report.exitCode, signal: report.signal, output: relative(root, dir) }))
  process.exitCode = report.exitCode ?? 1
}
