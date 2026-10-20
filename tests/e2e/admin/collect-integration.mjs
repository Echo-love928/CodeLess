import { readdirSync, readFileSync, writeFileSync, mkdirSync, existsSync, copyFileSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'

const destination = resolve('tests/e2e/admin/evidence/2026-10-20/integration')
mkdirSync(destination, { recursive: true })
const hash = data => 'sha256:' + createHash('sha256').update(data).digest('hex')
const normalized = text => text.split(/\r?\n/).map(line => line.trimEnd()).join('\n').trimEnd() + '\n'
const copyText = (source, name, tail) => {
  const raw = readFileSync(source), content = normalized(tail ? raw.toString('utf8').split(/\r?\n/).slice(-tail).join('\n') : raw.toString('utf8'))
  writeFileSync(join(destination, name), content)
  return { name, source, rawDigest: hash(raw), portableDigest: hash(content), normalization: 'LF and trailing whitespace only; raw logs retained privately', tailLines: tail ?? null }
}
const runs = []
const directories = [resolve('.local-data/d17-b/2026-10-20T06-39-14.932Z-api')]
for (const parent of ['.local-data/d17-b/integration/runs', '.local-data/d17-a/runs']) {
  if (!existsSync(parent)) continue
  for (const name of readdirSync(parent)) {
    const path = resolve(parent, name)
    if (existsSync(join(path, 'run.json'))) directories.push(path)
  }
}
for (const directory of directories) {
  const run = JSON.parse(readFileSync(join(directory, 'run.json'), 'utf8'))
  if (run.startedAt < '2026-10-20T06:30:00Z') continue
  const name = directory.split(/[\\/]/).at(-1)
  const portableLog = run.status === 'RUNNING' ? null : copyText(join(directory, 'command.log'), name + '.log', ['api', 'runner', 'static'].includes(run.mode) ? 100 : undefined)
  runs.push({ directory, ...run, portableLog })
}
writeFileSync(join(destination, 'commands.json'), JSON.stringify(runs, null, 2) + '\n')
const live = resolve('.local-data/d17-b/integration/live')
for (const name of readdirSync(live)) {
  const directory = join(live, name)
  if (!existsSync(join(directory, 'result.json'))) continue
  copyText(join(directory, 'result.json'), name + '-live.json')
  if (existsSync(join(directory, 'browser.log'))) copyText(join(directory, 'browser.log'), name + '-browser.log')
  for (const file of ['real-metrics.json', 'real-cancellation.json', 'real-cancel-failure.png', 'real-audit.png']) {
    if (existsSync(join(directory, file))) copyFileSync(join(directory, file), join(destination, name + '-' + file))
  }
}
const imported = JSON.parse(readFileSync('.local-data/d17-b/integration/import-verification.json', 'utf8'))
writeFileSync(join(destination, 'd17-a-import.json'), JSON.stringify({ upstream: '50d0044f78224319b3ef7eb8f4ea6454ba87af0a', importedCommit: '64782933ef68122d7efe58926580dc4eb184c954', files: imported }, null, 2) + '\n')
const paths = spawnSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z', '--',
  'apps/web/src/features/admin', 'apps/web/src/router.ts', 'contracts/admin', 'contracts/openapi.v0.json', 'scripts/run-static.mjs',
  'services/api/src/main/java/dev/codeless/api/admin', 'services/api/src/main/java/dev/codeless/api/auth', 'services/api/src/main/java/dev/codeless/api/tasks/TaskQueueService.java',
  'tests/admin', 'tests/e2e/admin', 'docs/admin-usage.md'], { encoding: 'utf8' }).stdout.split('\0').filter(path => path && !path.includes('/evidence/'))
writeFileSync(join(destination, 'source-digests.json'), JSON.stringify(Object.fromEntries([...new Set(paths)].sort().map(path => {
  const raw = readFileSync(path); return [path, { bytes: raw.length, rawDigest: hash(raw), lfDigest: hash(raw.toString('utf8').replaceAll('\r\n', '\n')) }]
})), null, 2) + '\n')
const reportDir = 'services/api/target/surefire-reports'
if (existsSync(reportDir)) for (const name of readdirSync(reportDir).filter(name => name.endsWith('.txt'))) {
  const source = join(reportDir, name), text = readFileSync(source, 'utf8')
  if (statSync(source).mtimeMs >= Date.parse('2026-10-20T06:39:00Z') && /Failures: [1-9]|Errors: [1-9]/.test(text)) copyText(source, name)
}
console.log(JSON.stringify(runs.map(({ mode, status, exitCode }) => ({ mode, status, exitCode })), null, 2))
