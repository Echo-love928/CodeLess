import { readdir, readFile, writeFile, mkdir, copyFile } from 'node:fs/promises'
import { join, resolve, relative } from 'node:path'
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'

const root = resolve('.local-data/d16-b'), output = resolve('tests/e2e/share/evidence/2026-10-19')
await mkdir(output, { recursive: true })
const hash = bytes => 'sha256:' + createHash('sha256').update(bytes).digest('hex')
const rawReportPath = join(root, 'api-repair-failure.raw.txt')
let rawReport
try { rawReport = await readFile(rawReportPath) }
catch (error) {
  if (error.code !== 'ENOENT') throw error
  const report = await readFile(join(output, 'api-repair-failure.txt'))
  try {
    const origin = JSON.parse(await readFile(join(output, 'api-repair-failure-origin.json'), 'utf8'))
    if (hash(report) !== origin.normalizedDigest) throw new Error('normalized failure report changed')
    // A checkout may not contain the private raw report. Preserve its original
    // provenance instead of relabeling normalized bytes as an original capture.
  } catch (originError) { if (originError.code !== 'ENOENT') throw originError; rawReport = report }
}
if (rawReport) {
  await writeFile(rawReportPath, rawReport)
  const normalizedReport = rawReport.toString('utf8').replaceAll('\r\n', '\n').split('\n').map(line => line.trimEnd()).join('\n').trimEnd() + '\n'
  await writeFile(join(output, 'api-repair-failure.txt'), normalizedReport)
  await writeFile(join(output, 'api-repair-failure-origin.json'), JSON.stringify({ rawPath: relative(resolve('.'), rawReportPath).replaceAll('\\', '/'),
    rawDigest: hash(rawReport), normalizedDigest: hash(normalizedReport), normalized: 'CRLF to LF; trailing whitespace only' }, null, 2) + '\n')
}
const runs = []
for (const name of (await readdir(root)).sort()) {
  if (!/^2026-.*-(?:unit|screenshot|browser|static|api|runner|e2e|gate)$/.test(name)) continue
  const metadata = JSON.parse(await readFile(join(root, name, 'run.json'), 'utf8'))
  const log = await readFile(join(root, name, 'command.log'))
  if (metadata.status !== 'RUNNING' && metadata.logDigest !== hash(log)) throw new Error('recorded command log changed')
  const text = log.toString('utf8')
  metadata.log = relative(resolve('.'), join(root, name, 'command.log')).replaceAll('\\', '/')
  metadata.resultLines = text.split(/\r?\n/).filter(line => /\[ci-gate\]|Tests run:|BUILD SUCCESS|BUILD FAILURE|ℹ (?:tests|pass|fail|cancelled|skipped)|Tests\s+\d+|Test Files|\d+ (?:passed|failed) \(/.test(line))
  runs.push(metadata)
}
await writeFile(join(output, 'commands.json'), JSON.stringify(runs, null, 2) + '\n')
const firstChecks = []
for (const [name, exitCode, description] of [['screenshot-first.log', 1, '6/7; taskkill PID-not-found race'], ['screenshot-fixed.log', 0, '7/7 after owned-process cleanup evidence correction'], ['ui-first.log', 0, '52/52 before additional cover metadata cases'], ['build.log', 0, 'production Vue build']]) {
  const bytes = await readFile(join(root, name))
  firstChecks.push({ log: relative(resolve('.'), join(root, name)).replaceAll('\\', '/'), exitCode, description, digest: hash(bytes) })
}
await writeFile(join(output, 'initial-checks.json'), JSON.stringify(firstChecks, null, 2) + '\n')
for (const run of runs.toReversed().filter(run => ['screenshot', 'e2e', 'gate'].includes(run.mode))) {
  const directory = join(resolve(run.log, '..'), 'screenshot')
  let result, png
  try { result = JSON.parse(await readFile(join(directory, 'T1-result.json'), 'utf8')); png = await readFile(join(directory, 'T1-cover.png')) }
  catch (error) { if (error.code === 'ENOENT') continue; throw error }
  if (result.status !== 'SUCCEEDED' || hash(png) !== result.imageDigest || png.length !== result.imageBytes) continue
  for (const name of ['T1-cover.png', 'T1-result.json', 'T2-result.json']) await copyFile(join(directory, name), join(output, name))
  await writeFile(join(output, 'artifact-origin.json'), JSON.stringify({ mode: run.mode, overallStatus: run.status,
    startedAt: run.startedAt, startHead: run.head, commandLog: run.log, commandLogDigest: run.logDigest ?? null,
    screenshotStatus: result.status, imageDigest: result.imageDigest }, null, 2) + '\n')
  break
}
const paths = spawnSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z', '--',
  'services/runner/src/screenshot', 'apps/web/src/features/deploy', 'apps/web/src/features/source', 'tests/e2e/share'], { encoding: 'utf8' }).stdout.split('\0').filter(Boolean)
const sources = {}
for (const path of [...new Set(paths)].filter(path => !path.includes('/evidence/'))) {
  const bytes = await readFile(path)
  sources[path] = { bytes: bytes.length, digest: hash(bytes), lfDigest: hash(bytes.toString('utf8').replaceAll('\r\n', '\n')) }
}
await writeFile(join(output, 'source-digests.json'), JSON.stringify(sources, null, 2) + '\n')
console.log(JSON.stringify({ output, runs: runs.map(({ mode, status, exitCode }) => ({ mode, status, exitCode })) }))
