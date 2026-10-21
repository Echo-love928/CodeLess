import { resolve, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { mkdir, open, writeFile } from 'node:fs/promises'
const repository = resolve('.')
const { run, environment, windows } = await import(pathToFileURL(join(repository, 'tests/e2e/full/support.mjs')))
const checkout = join(repository, '.local-data/d20-b/candidate-control')
const output = join(repository, '.local-data/d20-b/candidate-control-result')
await mkdir(output)
const env = environment()
const head = run('git', ['rev-parse', 'HEAD'], { cwd: checkout })
const report = { revision: head, baseline: 'c5bec0069702e87492f257093cccc9cce3e2e0eb',
  command: ['corepack', 'pnpm', 'verify:e2e'], freshWorktree: true, independentFrozenInstall: true,
  hypothesis: 'Candidate and baseline with independent frozen dependency installations can be compared without changing original limits or assertions.',
  startedAt: new Date().toISOString(), status: 'RUNNING' }
await writeFile(join(output, 'run.json'), JSON.stringify(report, null, 2))
console.log(JSON.stringify({ output, revision: head, status: 'RUNNING' }))
report.installOutput = run(windows ? process.env.ComSpec : 'corepack', windows
  ? ['/d', '/c', 'corepack', 'pnpm', 'install', '--frozen-lockfile'] : ['pnpm', 'install', '--frozen-lockfile'], { cwd: checkout, env })
const log = await open(join(output, 'command.log'), 'wx')
const child = spawn(windows ? process.env.ComSpec : 'corepack', windows
  ? ['/d', '/c', 'corepack', 'pnpm', 'verify:e2e'] : ['pnpm', 'verify:e2e'], { cwd: checkout, env, windowsHide: true, stdio: ['ignore', log.fd, log.fd] })
const [exitCode, signal] = await once(child, 'close')
await log.close()
Object.assign(report, { exitCode, signal, status: exitCode === 0 && signal === null ? 'PASSED' : 'FAILED', completedAt: new Date().toISOString() })
await writeFile(join(output, 'run.json'), JSON.stringify(report, null, 2) + '\n')
console.log(JSON.stringify({ output, revision: head, exitCode, signal, status: report.status }))
process.exitCode = exitCode === 0 && signal === null ? 0 : 1
