import { readdir, readFile, writeFile, mkdir, copyFile } from 'node:fs/promises'
import { join, resolve, relative } from 'node:path'
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'

const root = resolve('.local-data/d16-b'), output = resolve('tests/e2e/share/evidence/2026-10-19')
await mkdir(output, { recursive: true })
const hash = bytes => 'sha256:' + createHash('sha256').update(bytes).digest('hex')
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
const screenshot = runs.findLast(run => run.mode === 'screenshot' && run.status === 'PASSED')
if (screenshot) {
  const directory = join(resolve(screenshot.log, '..'), 'screenshot')
  for (const name of ['T1-cover.png', 'T1-result.json', 'T2-result.json']) await copyFile(join(directory, name), join(output, name))
}
const paths = spawnSync('git', ['ls-files', '--modified', '--others', '--exclude-standard', '-z', '--',
  'services/runner/src/screenshot', 'apps/web/src/features/deploy', 'apps/web/src/features/source', 'tests/e2e/share'], { encoding: 'utf8' }).stdout.split('\0').filter(Boolean)
const sources = {}
for (const path of [...new Set(paths)].filter(path => !path.includes('/evidence/'))) {
  const bytes = await readFile(path)
  sources[path] = { bytes: bytes.length, digest: hash(bytes), lfDigest: hash(bytes.toString('utf8').replaceAll('\r\n', '\n')) }
}
await writeFile(join(output, 'source-digests.json'), JSON.stringify(sources, null, 2) + '\n')
console.log(JSON.stringify({ output, runs: runs.map(({ mode, status, exitCode }) => ({ mode, status, exitCode })) }))
