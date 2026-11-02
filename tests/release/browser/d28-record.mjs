// Native receipts only; no retries, fabricated exits or model credentials.
import { spawn, spawnSync } from 'node:child_process'
import { once } from 'node:events'
import { createHash } from 'node:crypto'
import { mkdir, open, readFile, writeFile } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { pathToFileURL } from 'node:url'
import { environment, root, windows } from '../../e2e/full/support.mjs'

const mode = process.argv[2]
const output = join(root, '.local-data/d28-b/commands', new Date().toISOString().replaceAll(':', '-') + '-' + mode)
await mkdir(output, { recursive: true })
const commands = {
  flow: [process.execPath, 'tests/release/browser/d28-flow.mjs'],
  public: [process.execPath, 'tests/release/browser/d28-public.mjs', join(output, 'public')],
  api: ['corepack', 'pnpm', 'verify:api'],
  e2e: ['corepack', 'pnpm', 'verify:e2e'],
  gate: [process.execPath, '--import', pathToFileURL(join(root, 'tests/regression/release-api/stage-observer.mjs')).href, 'scripts/ci-gate.mjs'],
}
if (!Object.hasOwn(commands, mode)) throw new Error('Expected flow/public/api/e2e/gate')
const hash = bytes => createHash('sha256').update(bytes).digest('hex')
const git = args => {
  const result = spawnSync('git', args, { cwd: root, windowsHide: true, encoding: 'utf8' })
  if (result.status !== 0) throw new Error('Git metadata unavailable')
  return result.stdout.trim()
}
const paths = git(['ls-files', '--cached', '--others', '--exclude-standard']).split('\n').filter(p => p && !p.includes('/evidence/'))
const sources = Object.fromEntries(await Promise.all(paths.map(async path => [path, hash(await readFile(join(root, path)))])))
const env = environment()
if (mode === 'gate') env.D26_STAGE_EXITS = join(output, 'stages.jsonl')
const history = new Map()
if (['api', 'e2e', 'gate'].includes(mode)) {
  for (const path of git(['ls-files']).split('\n').filter(p => p.includes('/evidence/')))
    history.set(path, await readFile(join(root, path)))
}
const report = { task: 'D28-B', mode, command: commands[mode], output,
  head: git(['rev-parse', 'HEAD']), changes: git(['status', '--porcelain']), sources,
  startedAt: new Date().toISOString(), status: 'RUNNING', exitCode: null, signal: null,
  dockerHost: env.DOCKER_HOST ?? null, modelProvider: 'deterministic-mock', paidModelRequests: 0 }
const save = () => writeFile(join(output, 'run.json'), JSON.stringify(report, null, 2) + '\n')
await save()
console.log(JSON.stringify({ output, mode, status: 'RUNNING' }))
const log = await open(join(output, 'command.log'), 'wx')
const [command, ...args] = commands[mode]
const shell = windows && command === 'corepack'
const child = spawn(shell ? process.env.ComSpec : command, shell ? ['/d', '/c', command, ...args] : args,
  { cwd: root, env, windowsHide: true, stdio: ['ignore', log.fd, log.fd] })
try { [report.exitCode, report.signal] = await once(child, 'close') }
catch (error) { report.launchError = error.code ?? error.name }
finally {
  await log.close()
  report.historicalOutputs = []
  for (const [path, original] of history) {
    const generated = await readFile(join(root, path))
    if (generated.equals(original)) continue
    const destination = join(output, 'historical-outputs', path)
    await mkdir(dirname(destination), { recursive: true })
    await writeFile(destination, generated)
    await writeFile(join(root, path), original)
    report.historicalOutputs.push(path)
  }
  report.completedAt = new Date().toISOString()
  if (mode === 'gate') {
    try { report.stages = (await readFile(join(output, 'stages.jsonl'), 'utf8')).trim().split('\n').filter(Boolean).map(JSON.parse) }
    catch { report.stages = [] }
  }
  report.logSha256 = hash(await readFile(join(output, 'command.log')))
  report.changedSources = []
  for (const [path, digest] of Object.entries(sources)) {
    try { if (hash(await readFile(join(root, path))) !== digest) report.changedSources.push(path) }
    catch { report.changedSources.push(path) }
  }
  report.headUnchanged = git(['rev-parse', 'HEAD']) === report.head
  report.sourceBytesUnchanged = report.changedSources.length === 0
  report.status = report.exitCode === 0 && report.signal === null ? 'PASSED' : 'FAILED'
  await save()
  console.log(JSON.stringify({ output, mode, status: report.status, exitCode: report.exitCode, signal: report.signal }))
  process.exitCode = report.status === 'PASSED' ? 0 : report.exitCode || 1
}
