import { resolve, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { mkdir, writeFile } from 'node:fs/promises'
import { once } from 'node:events'
import { randomUUID } from 'node:crypto'
const repository = resolve('.')
const { run, environment, windows } = await import(pathToFileURL(join(repository, 'tests/e2e/full/support.mjs')))
const baseline = 'c5bec0069702e87492f257093cccc9cce3e2e0eb'
const output = join(repository, '.local-data/d20-b/baseline-' + randomUUID().slice(0, 8))
const checkout = join(output, 'checkout')
await mkdir(checkout, { recursive: true })
const report = { baseline, tree: run('git', ['rev-parse', baseline + '^{tree}']),
  hypothesis: 'The unmodified main suite can exhibit Windows browser cleanup/deadline failures independently of D20-B, which had not started at failure.',
  currentCode: run('git', ['rev-parse', 'HEAD']), startedAt: new Date().toISOString(),
  command: ['corepack', 'pnpm', 'verify:e2e'], retries: 0,
  originalSuiteDiff: run('git', ['diff', baseline, 'HEAD', '--', 'services/runner/src', 'tests/e2e/generation', 'tests/e2e/preview', 'tests/e2e/share', 'tests/e2e/runner', 'apps/web/playwright.config.ts']) }
run('git', ['archive', '--format=tar', '--output=' + join(output, 'main.tar'), baseline])
run('tar', ['-xf', join(output, 'main.tar'), '-C', checkout])
await writeFile(join(output, 'run.json'), JSON.stringify(report, null, 2))
console.log(JSON.stringify({ output, status: 'RUNNING', baseline }))
report.installOutput = run(windows ? process.env.ComSpec : 'corepack', windows
  ? ['/d', '/c', 'corepack', 'pnpm', 'install', '--frozen-lockfile'] : ['pnpm', 'install', '--frozen-lockfile'], { cwd: checkout, env: environment() })
const args = windows ? ['/d', '/c', 'corepack', 'pnpm', 'verify:e2e'] : ['pnpm', 'verify:e2e']
const { spawn } = await import('node:child_process')
const { open } = await import('node:fs/promises')
const log = await open(join(output, 'baseline.log'), 'wx')
const suite = spawn(windows ? process.env.ComSpec : 'corepack', args, { cwd: checkout, env: environment(), windowsHide: true, stdio: ['ignore', log.fd, log.fd] })
const [exitCode, signal] = await once(suite, 'close')
await log.close()
Object.assign(report, { exitCode, signal, completedAt: new Date().toISOString(), status: exitCode === 0 && signal === null ? 'PASSED' : 'FAILED' })
await writeFile(join(output, 'run.json'), JSON.stringify(report, null, 2) + '\n')
console.log(JSON.stringify({ output, baseline, exitCode, signal, status: report.status }))
process.exitCode = exitCode === 0 && signal === null ? 0 : 1
