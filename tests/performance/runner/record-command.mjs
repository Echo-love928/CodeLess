import { spawn } from 'node:child_process'
import { mkdir, writeFile, readFile } from 'node:fs/promises'
import { createWriteStream } from 'node:fs'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { environment } from '../../e2e/full/support.mjs'
import { root, command, sha } from './support.mjs'

const modes = { measure: ['--test', '--test-concurrency=1', 'tests/performance/runner/acceptance.test.mjs'],
  api: ['tests/performance/runner/api-isolation.mjs'], gate: ['scripts/ci-gate.mjs'],
  runner: ['--run', 'verify:runner'], static: ['--run', 'verify:static'], e2e: ['--run', 'verify:e2e'] }
const mode = process.argv[2]
if (!modes[mode]) throw new Error('Usage: node tests/performance/runner/record-command.mjs measure|api|gate|runner|static|e2e')
const directory = join(root, '.local-data/d22-b/commands', new Date().toISOString().replaceAll(':', '-') + '-' + mode + '-' + randomUUID())
await mkdir(directory, { recursive: true })
const report = { mode, command: [process.execPath, ...modes[mode]], startedAt: new Date().toISOString(),
  revision: command('git', ['rev-parse', 'HEAD']), startChanges: command('git', ['status', '--porcelain']), exitCode: null, signal: null }
await writeFile(join(directory, 'command.json'), JSON.stringify(report, null, 2))
console.log(directory)
const stream = createWriteStream(join(directory, 'output.log'), { flags: 'wx' })
const child = spawn(process.execPath, modes[mode], { cwd: root, env: environment(), windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
child.stdout.on('data', bytes => { stream.write(bytes); process.stdout.write(bytes) })
child.stderr.on('data', bytes => { stream.write(bytes); process.stderr.write(bytes) })
child.once('error', error => { report.launchError = error.message })
child.once('close', async (exitCode, signal) => {
  await new Promise(done => stream.end(done))
  Object.assign(report, { exitCode, signal, completedAt: new Date().toISOString(), logDigest: sha(await readFile(join(directory, 'output.log'))),
    endRevision: command('git', ['rev-parse', 'HEAD']), endChanges: command('git', ['status', '--porcelain']) })
  await writeFile(join(directory, 'command.json'), JSON.stringify(report, null, 2) + '\n')
  process.exitCode = exitCode === 0 && signal === null && !report.launchError ? 0 : exitCode || 1
})
