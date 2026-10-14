import { readdirSync, existsSync, readFileSync, writeFileSync, mkdirSync, copyFileSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { createHash } from 'node:crypto'

const output = resolve('tests/e2e/selector/evidence/2026-10-13')
mkdirSync(output, { recursive: true })
const hash = bytes => 'sha256:' + createHash('sha256').update(bytes).digest('hex')
const runs = readdirSync('.local-data/d13-b').sort().flatMap(name => {
  const directory = join('.local-data/d13-b', name), path = join(directory, 'run.json')
  if (!existsSync(path)) return []
  const raw = JSON.parse(readFileSync(path, 'utf8')), log = readFileSync(join(directory, 'command.log'))
  if (raw.logDigest && raw.logDigest !== hash(log)) throw new Error('Recorded log changed: ' + name)
  const interrupted = raw.status === 'RUNNING'
  const item = { ...raw, ...(interrupted ? { status: 'UNKNOWN', rawRecorderStatus: 'RUNNING', note: 'Explicitly terminated fixture test; recorder did not observe completion. Native exit remains null.' } : {}),
    evidenceDirectory: directory.replaceAll('\\', '/'), observedLogDigest: hash(log) }
  if (['unit', 'static', 'browser', 'authProbe'].includes(raw.mode)) {
    copyFileSync(join(directory, 'command.log'), join(output, name + '.log'))
    item.portableLog = name + '.log'
  } else {
    const summary = log.toString('utf8').split(/\r?\n/).filter(line => /\[ci-gate\]|Tests run:|BUILD SUCCESS|BUILD FAILURE|ℹ (tests|pass|fail|skipped)|\d+ passed|\d+ failed|Error: expect|pageClosed|flow.spec.ts:101/.test(line)).join('\n')
    writeFileSync(join(output, name + '-summary.log'), summary + '\n')
    item.portableSummary = name + '-summary.log'
  }
  return [item]
})
writeFileSync(join(output, 'commands.json'), JSON.stringify(runs, null, 2) + '\n')

const screenshotDirectory = readdirSync('apps/web/test-results').find(name => name.startsWith('selector-flow-D13-B-T4-'))
for (const name of ['T4-shared.png', 'T4-shared-mobile.png']) copyFileSync(join('apps/web/test-results', screenshotDirectory, name), join(output, name))
const preview = readdirSync('services/api/target').filter(name => name.startsWith('preview-platform-') && existsSync(join('services/api/target', name, 'evidence/component-platform.json')))
  .sort((a, b) => statSync(join('services/api/target', b)).mtimeMs - statSync(join('services/api/target', a)).mtimeMs)[0]
for (const name of ['component-platform.json', 'component-edit-platform.png']) copyFileSync(join('services/api/target', preview, 'evidence', name), join(output, name))

const trace = readFileSync('.local-data/d13-b/login-diagnostic/0-trace.trace', 'utf8').trim().split('\n').map(line => JSON.parse(line))
writeFileSync(join(output, 'login-failure-diagnostic.json'), JSON.stringify({
  gateResult: 'Latest full E2E 44/45, exit1. Earlier complete ci:gate exit0. No failure overwritten.',
  failureLocation: 'tests/e2e/auth/flow.spec.ts:101', rootCause: 'UNKNOWN',
  observations: trace.filter(event => event.method === 'pageClosed' || event.class === 'Route' && event.method === 'fulfill' && event.params.status === 401 && !event.params.body)
    .map(event => ({ type: event.type, time: event.time ?? event.startTime, method: event.method, status: event.params?.status ?? null })),
  isolatedProbe: runs.findLast(run => run.mode === 'authProbe'),
  qualification: 'The isolated pass does not prove a fix or replace the failed full E2E. API preview and full E2E were concurrently running during this failed run; causality is unproven.',
  rawTrace: '.local-data/d13-b/login-diagnostic',
}, null, 2) + '\n')
writeFileSync(join(output, 'artifact-digests.json'), JSON.stringify(readdirSync(output).filter(name => name !== 'artifact-digests.json').map(name => ({ path: name, digest: hash(readFileSync(join(output, name))), bytes: statSync(join(output, name)).size })), null, 2) + '\n')
console.log(JSON.stringify({ output, runs: runs.length, latestSelector: runs.findLast(run => run.mode === 'browser')?.status, latestFullE2E: runs.findLast(run => run.mode === 'e2e')?.status }))
