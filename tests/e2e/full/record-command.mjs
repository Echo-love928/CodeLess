import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile, open } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { environment, root, run, windows } from './support.mjs'

const mode = process.argv[2]
const commands = { full: [process.execPath, 'tests/e2e/full/run.mjs'],
  static: ['corepack', 'pnpm', 'verify:static'], api: ['corepack', 'pnpm', 'verify:api'],
  runner: ['corepack', 'pnpm', 'verify:runner'], e2e: ['corepack', 'pnpm', 'verify:e2e'], gate: ['corepack', 'pnpm', 'ci:gate'] }
if (!Object.hasOwn(commands, mode)) throw new Error('Expected full/static/api/runner/e2e/gate')
const output = join(root, '.local-data/d20-b/commands', new Date().toISOString().replaceAll(':', '-') + '-' + mode)
await mkdir(output, { recursive: true })
const env = environment()
if (mode === 'full' && process.env.CODELESS_FULL_INJECT_ASSERTION === '1') env.CODELESS_FULL_INJECT_ASSERTION = '1'
const sha = bytes => 'sha256:' + createHash('sha256').update(bytes).digest('hex')
const files = run('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z']).split('\0').filter(p => p && !p.includes('/evidence/'))
const metadata = { task: 'D20-B', mode, command: commands[mode], startedAt: new Date().toISOString(), status: 'RUNNING',
  revision: run('git', ['rev-parse', 'HEAD']), revisionRole: 'checkout-reference', changes: run('git', ['status', '--porcelain']),
  sources: Object.fromEntries(await Promise.all(files.map(async p => [p, sha(await readFile(join(root, p)))]))),
  node: process.version, javaHome: env.JAVA_HOME, exitCode: null, signal: null }
const history = new Map()
if (['api', 'e2e', 'gate'].includes(mode)) {
  const tracked = run('git', ['ls-files', '-z']).split('\0').filter(p => p && p.includes('/evidence/'))
  for (const p of tracked) history.set(p, await readFile(join(root, p)))
}
const save = () => writeFile(join(output, 'run.json'), JSON.stringify(metadata, null, 2) + '\n')
await save(); console.log(JSON.stringify({ output, mode, status: 'RUNNING' }))
const log = await open(join(output, 'command.log'), 'wx'), [command, ...args] = commands[mode]
const shell = windows && command === 'corepack'
const child = spawn(shell ? process.env.ComSpec : command, shell ? ['/d', '/c', command, ...args] : args,
  { cwd: root, env, windowsHide: true, stdio: ['ignore', log.fd, log.fd] })
try { [metadata.exitCode, metadata.signal] = await once(child, 'close') }
catch (error) { metadata.launchError = error.message }
finally {
  await log.close()
  metadata.historicalOutputs = []
  for (const [p, original] of history) {
    const generated = await readFile(join(root, p))
    if (generated.equals(original)) continue
    const destination = join(output, 'historical-outputs', p)
    await mkdir(dirname(destination), { recursive: true }); await writeFile(destination, generated)
    await writeFile(join(root, p), original); metadata.historicalOutputs.push(p)
  }
  metadata.completedAt = new Date().toISOString()
  metadata.status = metadata.exitCode === 0 && metadata.signal === null ? 'PASSED' : 'FAILED'
  metadata.logDigest = sha(await readFile(join(output, 'command.log')))
  metadata.changedSources = []
  for (const [p, digest] of Object.entries(metadata.sources)) {
    try { if (sha(await readFile(join(root, p))) !== digest) metadata.changedSources.push(p) }
    catch { metadata.changedSources.push(p) }
  }
  metadata.endChanges = run('git', ['status', '--porcelain'])
  metadata.canonical = !metadata.changes && !metadata.endChanges && !metadata.changedSources.length && run('git', ['rev-parse', 'HEAD']) === metadata.revision
  await save(); console.log(JSON.stringify({ output, mode, exitCode: metadata.exitCode, signal: metadata.signal, status: metadata.status }))
  process.exitCode = metadata.status === 'PASSED' ? 0 : metadata.exitCode || 1
}
