// Reuse the existing task-local Java/Corepack environment; never inherit model credentials.
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { mkdir, readFile, writeFile, open } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { environment, root, run, windows } from '../../tests/e2e/full/support.mjs'
import { sha } from './core.mjs'

const mode = process.argv[2]
const commands = { unit: [process.execPath, '--test', 'tests/eval/browser/core.test.mjs', 'tests/eval/browser/batch.test.mjs', 'tests/eval/browser/behavior.test.mjs', 'tests/eval/browser/edit-records.test.mjs'],
  fixture: [process.execPath, 'evals/browser/run.mjs', '--fixture'], batch: [process.execPath, 'evals/browser/run.mjs', '--batch', ...process.argv.slice(3)],
  gate: ['corepack', 'pnpm', 'ci:gate'], static: ['corepack', 'pnpm', 'verify:static'], api: ['corepack', 'pnpm', 'verify:api'],
  runner: ['corepack', 'pnpm', 'verify:runner'], e2e: ['corepack', 'pnpm', 'verify:e2e'] }
if (!Object.hasOwn(commands, mode) || commands[mode].some(value => !value)) throw new Error('Expected unit/fixture/batch <directory>/static/api/runner/e2e/gate')
const output = join(root, '.local-data/d21-b/commands', new Date().toISOString().replaceAll(':', '-') + '-' + mode)
await mkdir(output, { recursive: true })
const env = environment()
for (const key of Object.keys(env)) if (/API_KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL/.test(key)) delete env[key]
env.CODELESS_MODEL_PROVIDER = 'deterministic-mock'
const sources = run('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z']).split('\0').filter(p => p && !p.includes('/evidence/'))
const record = { task: 'D21-B', command: commands[mode], mode, startedAt: new Date().toISOString(),
  revision: run('git', ['rev-parse', 'HEAD']), changes: run('git', ['status', '--porcelain']), node: process.version,
  sources: Object.fromEntries(await Promise.all(sources.map(async p => [p, sha(await readFile(join(root, p)))]))), exitCode: null, signal: null }
const history = new Map()
if (['api', 'e2e', 'gate'].includes(mode)) for (const p of run('git', ['ls-files', '-z']).split('\0').filter(p => p.includes('/evidence/'))) history.set(p, await readFile(join(root, p)))
const save = () => writeFile(join(output, 'command.json'), JSON.stringify(record, null, 2) + '\n')
await save(); console.log(JSON.stringify({ output, mode }))
const log = await open(join(output, 'command.log'), 'wx')
const [command, ...args] = commands[mode], shell = windows && command === 'corepack'
const child = spawn(shell ? process.env.ComSpec : command, shell ? ['/d', '/c', command, ...args] : args, { cwd: root, env, windowsHide: true, stdio: ['ignore', log.fd, log.fd] })
try { [record.exitCode, record.signal] = await once(child, 'close') }
catch (error) { record.launchError = error.message }
finally {
  await log.close(); record.completedAt = new Date().toISOString(); record.historicalOutputs = []
  for (const [path, original] of history) {
    const generated = await readFile(join(root, path))
    if (!generated.equals(original)) {
      const destination = join(output, 'historical-outputs', path)
      await mkdir(dirname(destination), { recursive: true }); await writeFile(destination, generated)
      await writeFile(join(root, path), original); record.historicalOutputs.push(path)
    }
  }
  record.changedSources = []
  for (const [path, digest] of Object.entries(record.sources)) {
    try { if (sha(await readFile(join(root, path))) !== digest) record.changedSources.push(path) }
    catch { record.changedSources.push(path) }
  }
  record.logDigest = sha(await readFile(join(output, 'command.log')))
  record.status = record.exitCode === 0 && record.signal === null ? 'PASSED' : 'FAILED'
  record.endChanges = run('git', ['status', '--porcelain'])
  record.canonical = !record.changes && !record.endChanges && !record.changedSources.length && run('git', ['rev-parse', 'HEAD']) === record.revision
  await save(); console.log(JSON.stringify({ output, mode, status: record.status, exitCode: record.exitCode, signal: record.signal }))
  process.exitCode = record.status === 'PASSED' ? 0 : record.exitCode || 1
}
