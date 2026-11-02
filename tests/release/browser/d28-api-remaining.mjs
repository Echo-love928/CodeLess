// Resume only suites lacking a completed fresh JUnit report. Never retry failed
// suites or turn an interrupted full command into a successful full gate.
import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import { once } from 'node:events'
import { createHash } from 'node:crypto'
import { mkdir, open, readFile, writeFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { environment, root, windows } from '../../e2e/full/support.mjs'

const planBytes = await readFile(join(root, '.local-data/d28-b/api-remaining-plan.json'))
const plan = JSON.parse(planBytes)
const head = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8', windowsHide: true }).stdout.trim()
assert.equal(head, plan.sourceHead)
assert.equal(plan.remainingSuites.length, 17)
assert.equal(new Set(plan.remainingSuites).size, 17)
for (const name of plan.remainingSuites) {
  assert.match(name, /^dev\.codeless\.api\.[A-Za-z0-9_.]+Test$/)
  await readFile(join(root, 'services/api/src/test/java', name.replaceAll('.', '/') + '.java'))
}
const hash = b => createHash('sha256').update(b).digest('hex')
const sourceNames = spawnSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'],
  { cwd: root, encoding: 'utf8', windowsHide: true }).stdout.trim().split(/\r?\n/).filter(p => p && !p.includes('/evidence/'))
const sources = Object.fromEntries(await Promise.all(sourceNames.map(async path => [path, hash(await readFile(join(root, path)))])))
const output = join(root, '.local-data/d28-b/commands', new Date().toISOString().replaceAll(':', '-') + '-api-remaining')
await mkdir(output, { recursive: true })
const command = windows ? process.env.ComSpec : './services/api/mvnw'
const args = [...(windows ? ['/d', '/c', 'services\\api\\mvnw.cmd'] : []), '-f', 'services/api/pom.xml',
  '-Dtest=' + plan.remainingSuites.join(','), 'verify']
const report = { task: 'D28-B', mode: 'api-remaining', head, command: [command, ...args],
  selectedSuites: plan.remainingSuites, planSha256: hash(planBytes), sources,
  startedAt: new Date().toISOString(), status: 'RUNNING', exitCode: null, signal: null,
  fullApiGatePassed: false, interruptedOriginalExitCode: null, failedSuitesRetried: false }
const save = () => writeFile(join(output, 'run.json'), JSON.stringify(report, null, 2) + '\n')
await save(); console.log(JSON.stringify({ output, status: 'RUNNING', suites: plan.remainingSuites.length }))
const history = new Map()
const tracked = spawnSync('git', ['ls-files'], { cwd: root, encoding: 'utf8', windowsHide: true }).stdout.trim().split(/\r?\n/)
for (const path of tracked.filter(p => p.includes('/evidence/'))) history.set(path, await readFile(join(root, path)))
const log = await open(join(output, 'command.log'), 'wx')
const child = spawn(command, args, { cwd: root, env: environment(), windowsHide: true, stdio: ['ignore', log.fd, log.fd] })
try { [report.exitCode, report.signal] = await once(child, 'close') }
catch (error) { report.launchError = error.code ?? error.name }
finally {
  await log.close()
  report.completedAt = new Date().toISOString()
  report.logSha256 = hash(await readFile(join(output, 'command.log')))
  report.historicalOutputs = []
  for (const [path, original] of history) {
    const generated = await readFile(join(root, path))
    if (!generated.equals(original)) {
      const destination = join(output, 'historical-output-' + report.historicalOutputs.length)
      await writeFile(destination, generated)
      await writeFile(join(root, path), original)
      report.historicalOutputs.push({ path, savedAs: destination })
    }
  }
  report.changedSources = []
  for (const [path, digest] of Object.entries(sources)) {
    if (hash(await readFile(join(root, path))) !== digest) report.changedSources.push(path)
  }
  report.headUnchanged = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8', windowsHide: true }).stdout.trim() === head
  report.sourceBytesUnchanged = report.changedSources.length === 0
  report.status = report.exitCode === 0 && report.signal === null ? 'PASSED_SELECTED_SUITES_ONLY' : 'FAILED'
  await mkdir(join(output, 'junit'))
  for (const name of await readdir(join(root, 'services/api/target/surefire-reports'))) {
    if (plan.remainingSuites.some(suite => name === 'TEST-' + suite + '.xml'))
      await writeFile(join(output, 'junit', name), await readFile(join(root, 'services/api/target/surefire-reports', name)))
  }
  await save(); console.log(JSON.stringify({ output, status: report.status, exitCode: report.exitCode, signal: report.signal }))
  process.exitCode = report.exitCode === 0 && report.signal === null && report.headUnchanged && report.sourceBytesUnchanged ? 0 : 1
}
