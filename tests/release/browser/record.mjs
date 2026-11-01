// Fixed D27 commands with native exit/signal/log digest; raw logs stay ignored.
import { spawn, spawnSync } from 'node:child_process'
import { once } from 'node:events'
import { mkdir, open, readFile, writeFile, readdir } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { root, hash, verify } from '../../../infra/release/client/package.mjs'
import assert from 'node:assert/strict'
const [mode, ...args] = process.argv.slice(2)
const modes = { unit: 'package.test.mjs', audit: 'audit.mjs', public: 'public.mjs', ingress: 'ingress.mjs', sample: 'sample.mjs', image: 'build-image.mjs' }
const output = resolve(root, '.local-data/d27-b/commands', new Date().toISOString().replaceAll(':', '-') + '-' + mode)
await mkdir(output, { recursive: true })
const git = values => {
  const result = spawnSync('git', values, { cwd: root, encoding: 'utf8', windowsHide: true })
  assert.equal(result.status, 0); return result.stdout.trim()
}
const sourcePaths = ['infra/release/client/package.mjs', 'infra/release/client/config.json',
  ...(await readdir(join(root, 'tests/release/browser'))).filter(p => p.endsWith('.mjs')).map(p => 'tests/release/browser/' + p)]
const sources = Object.fromEntries(await Promise.all(sourcePaths.map(async path => [path, hash(await readFile(join(root, path)))])))
const report = { task: 'D27-B', mode, revision: git(['rev-parse', 'HEAD']), revisionRole: 'checkout-reference', changes: git(['status', '--porcelain']), sources, startedAt: new Date().toISOString(),
  status: 'RUNNING', exitCode: null, signal: null }
const save = () => writeFile(join(output, 'run.json'), JSON.stringify(report, null, 2) + '\n')
await save()
try {
  if (mode === 'compare') {
    const [commit, left, right] = args
    const a = await verify(resolve(left), commit), b = await verify(resolve(right), commit)
    for (const key of ['files', 'commit', 'toolchain', 'config', 'builderSha256', 'sourceArchiveSha256']) assert.deepEqual(a[key], b[key], key)
    report.manifests = [a, b].map(m => hash(Buffer.from(JSON.stringify(m))))
    report.exitCode = 0
  } else {
    let childArgs
    if (mode === 'build' || mode === 'verify') childArgs = ['infra/release/client/package.mjs', mode, ...args]
    else if (Object.hasOwn(modes, mode)) childArgs = [...(mode === 'unit' ? ['--test'] : []), 'tests/release/browser/' + modes[mode], ...args]
    else throw new Error('Expected unit/build/verify/audit/public/ingress/compare')
    report.command = ['node', ...childArgs]
    const fd = await open(join(output, 'command.log'), 'wx')
    const child = spawn(process.execPath, childArgs, { cwd: root, windowsHide: true, stdio: ['ignore', fd.fd, fd.fd] })
    try { [report.exitCode, report.signal] = await once(child, 'close') }
    finally { await fd.close() }
    report.logSha256 = hash(await readFile(join(output, 'command.log')))
  }
} catch (error) { report.error = error.code ?? error.name }
report.completedAt = new Date().toISOString()
report.changedSources = []
for (const [path, digest] of Object.entries(sources)) if (hash(await readFile(join(root, path))) !== digest) report.changedSources.push(path)
report.canonical = !report.changes && !report.changedSources.length && git(['rev-parse', 'HEAD']) === report.revision
report.status = report.exitCode === 0 && !report.signal ? 'PASSED' : 'FAILED'
await save(); console.log(JSON.stringify({ output, mode, status: report.status, exitCode: report.exitCode, signal: report.signal, canonical: report.canonical }))
if (report.status !== 'PASSED') process.exitCode = report.exitCode || 1
