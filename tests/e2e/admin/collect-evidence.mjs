import { readdirSync, readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'

const root = resolve('.local-data/d17-b'), destination = resolve('tests/e2e/admin/evidence/2026-10-20')
mkdirSync(destination, { recursive: true })
const normalize = value => value.split(/\r?\n/).map(line => line.trimEnd()).join('\n').trimEnd() + '\n'
const commands = []
for (const name of readdirSync(root).sort()) {
  if (!/^2026-.*-(unit|browser|static|api|runner|e2e|gate|build|auth-http)$/.test(name) || !existsSync(join(root, name, 'run.json'))) continue
  const directory = join(root, name), run = JSON.parse(readFileSync(join(directory, 'run.json'), 'utf8'))
  const log = readFileSync(join(directory, 'command.log'), 'utf8')
  let portableLog
  if (run.status !== 'RUNNING') {
    const summary = ['unit', 'browser', 'e2e'].includes(run.mode) ? log : log.split(/\r?\n/).slice(-100).join('\n')
    const normalized = normalize(summary)
    writeFileSync(join(destination, name + '.log'), normalized)
    portableLog = { name: name + '.log', normalization: 'LF, trim trailing whitespace and terminal blank lines; raw log preserved privately',
      digest: 'sha256:' + createHash('sha256').update(normalized).digest('hex') }
  }
  commands.push({ directory, ...run, portableLog })
}
const extraEvidence = [
  ['services/api/target/surefire-reports/dev.codeless.api.agent.RepairLoopIntegrationTest.txt', 'api-assertion-failure.log'],
  ['services/api/target/surefire-reports/dev.codeless.api.auth.AuthIntegrationTest.txt', 'api-auth-regression.log'],
  ['.local-data/d17-b/api-threads-after-clock-leap.txt', 'api-wait-stack.log'],
]
const origins = []
for (const [source, name] of extraEvidence) {
  if (!existsSync(source)) continue
  const raw = readFileSync(source), content = normalize(raw.toString('utf8'))
  writeFileSync(join(destination, name), content)
  origins.push({ source, name, rawDigest: 'sha256:' + createHash('sha256').update(raw).digest('hex'),
    normalizedDigest: 'sha256:' + createHash('sha256').update(content).digest('hex') })
}
writeFileSync(join(destination, 'extra-evidence-origins.json'), JSON.stringify(origins, null, 2) + '\n')
writeFileSync(join(destination, 'commands.json'), JSON.stringify(commands, null, 2) + '\n')
for (const name of readdirSync(root).filter(name => name.endsWith('-auth-http') && existsSync(join(root, name, 'result.json')))) {
  const directory = join(root, name)
  const result = JSON.parse(readFileSync(join(directory, 'result.json'), 'utf8'))
  const execution = existsSync(join(directory, 'execution.json')) ? JSON.parse(readFileSync(join(directory, 'execution.json'), 'utf8')) : null
  writeFileSync(join(destination, name + '.json'), JSON.stringify({ directory, execution, ...result }, null, 2) + '\n')
}
const paths = spawnSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z', '--', 'apps/web/src/features/admin', 'apps/web/src/router.ts', 'tests/e2e/admin', 'docs/admin-usage.md'], { encoding: 'utf8' }).stdout.split('\0').filter(path => path && !path.includes('/evidence/')).sort()
const sourceDigests = Object.fromEntries(paths.map(path => [path, 'sha256:' + createHash('sha256').update(readFileSync(path)).digest('hex')]))
writeFileSync(join(destination, 'source-digests.json'), JSON.stringify(sourceDigests, null, 2) + '\n')
console.log(JSON.stringify(commands.map(({ mode, exitCode, status }) => ({ mode, exitCode, status })), null, 2))
