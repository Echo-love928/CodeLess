// Fixed developer commands, direct logs and native exit status. No runtime shell.
import { spawn, spawnSync } from 'node:child_process'
import { mkdirSync, openSync, closeSync, readFileSync, writeFileSync, renameSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { createHash, randomUUID } from 'node:crypto'
const mode = process.argv[2]
const commands = {
  acceptance: ['--test', 'tests/runner/mapping/acceptance.test.mjs'],
  contracts: ['--test', 'tests/runner/mapping/contracts.test.mjs'],
  gate: ['scripts/ci-gate.mjs'],
  preview: [],
}
if (!Object.hasOwn(commands, mode) || process.argv.length !== 3) throw new Error('Usage: record-command.mjs acceptance|contracts|gate|preview')
const isWindows = process.platform === 'win32'
const command = mode === 'preview' ? (isWindows ? process.env.ComSpec ?? 'cmd.exe' : './services/api/mvnw') : process.execPath
const args = mode === 'preview' ? [ ...(isWindows ? ['/d', '/c', 'services\\api\\mvnw.cmd'] : []),
  '-f', 'services/api/pom.xml', '-Dtest=PreviewPlatformIntegrationTest', 'test'] : commands[mode]
const run = resolve('.local-data/d12-b/runs', `${new Date().toISOString().replaceAll(':', '-')}-${mode}-${randomUUID()}`)
mkdirSync(run, { recursive: true })
const env = { ...process.env, CODELESS_MODEL_PROVIDER: 'deterministic-mock', CODELESS_MAPPING_EVIDENCE_DIR: join(run, 'mapping') }
for (const key of ['CODELESS_MODEL_API_KEY', 'CODELESS_MODEL_NAME', 'CODELESS_PLAYWRIGHT_CHANNEL']) delete env[key]
const head = spawnSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' })
if (head.status !== 0) throw new Error('Cannot record HEAD')
const changes = spawnSync('git', ['status', '--porcelain'], { encoding: 'utf8' })
const metadata = { mode, head: head.stdout.trim(), uncommittedChanges: changes.stdout.trim(), command: [command, ...args],
  startedAt: new Date().toISOString(), status: 'RUNNING', exitCode: null, signal: null, modelProvider: env.CODELESS_MODEL_PROVIDER }
function save() { writeFileSync(join(run, 'run.json.pending'), JSON.stringify(metadata, null, 2) + '\n'); renameSync(join(run, 'run.json.pending'), join(run, 'run.json')) }
save()
const fd = openSync(join(run, 'command.log'), 'wx')
console.log(JSON.stringify({ run, status: 'RUNNING' }))
const child = spawn(command, args, { env, stdio: ['ignore', fd, fd], windowsHide: true })
let finished = false
function finish(code, signal, error) {
  if (finished) return
  finished = true; closeSync(fd)
  Object.assign(metadata, { completedAt: new Date().toISOString(), exitCode: code, signal,
    status: error ? 'LAUNCH_FAILED' : code === 0 && signal === null ? 'PASSED' : 'FAILED',
    logDigest: 'sha256:' + createHash('sha256').update(readFileSync(join(run, 'command.log'))).digest('hex') })
  if (error) metadata.errorCode = error.code ?? 'UNKNOWN'
  save(); console.log(JSON.stringify({ run, status: metadata.status, exitCode: code, signal }))
  process.exitCode = code === 0 && signal === null && !error ? 0 : Number.isInteger(code) && code !== 0 ? code : 1
}
child.once('error', error => finish(null, null, error))
child.once('exit', (code, signal) => finish(code, signal))
