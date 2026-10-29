// Export only allowlisted acceptance metadata; raw API logs/session-bearing traces stay private.
import { readFileSync, writeFileSync, mkdirSync, readdirSync, copyFileSync, existsSync } from 'node:fs'
import { join, resolve, relative, basename } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'
const root = fileURLToPath(new URL('../../', import.meta.url))
const output = join(root, 'tests/install/evidence/2026-10-28')
mkdirSync(output, { recursive: true })
const read = p => JSON.parse(readFileSync(p, 'utf8'))
const save = (p, value) => writeFileSync(join(output, p), JSON.stringify(value, null, 2) + '\n')
const sha = bytes => 'sha256:' + createHash('sha256').update(bytes).digest('hex')
const redact = text => {
  for (const path of [root, root.replaceAll('/', '\\'), resolve(root), resolve(root).replaceAll('\\', '/')]) {
    const normalized = path.replace(/[\\/]$/, '')
    text = text.replaceAll(JSON.stringify(normalized).slice(1, -1), '<checkout>').replaceAll(normalized, '<checkout>')
  }
  return text
}
const commandsRoot = join(root, '.local-data/d23-b/commands')
const commands = readdirSync(commandsRoot).sort().map(name => {
  const r = read(join(commandsRoot, name, 'run.json'))
  return { mode: r.mode, startedAt: r.startedAt, completedAt: r.completedAt ?? null, status: r.status,
    exitCode: r.exitCode, signal: r.signal, revision: r.revision, changes: r.changes, node: r.node,
    command: [basename(r.command[0]), ...r.command.slice(1)], logDigest: r.logDigest ?? null,
    privateEvidence: '.local-data/d23-b/commands/' + name, sources: r.sources, changedSources: r.changedSources ?? [] }
})
save('commands.json', commands)
const fullRoot = join(root, '.local-data/d20-b/runs')
const fullRuns = existsSync(fullRoot) ? readdirSync(fullRoot).sort().filter(name => existsSync(join(fullRoot, name, 'run.json'))) : []
const summaries = []
for (const name of fullRuns) {
  const directory = join(fullRoot, name), r = read(join(directory, 'run.json'))
  const counts = rows => Object.fromEntries([...new Set((rows ?? []).map(row => row.status))].map(status => [status, rows.filter(row => row.status === status).length]))
  summaries.push({ privateEvidence: '.local-data/d20-b/runs/' + name, reportDigest: sha(readFileSync(join(directory, 'run.json'))),
    startedAt: r.startedAt, completedAt: r.completedAt ?? null, revision: r.revision, status: r.status,
    browserExitCode: r.browserExitCode ?? null, browserSignal: r.browserSignal ?? null,
    canonical: r.canonical ?? false, changedSources: r.changedSources ?? [], cleanDatabase: r.cleanDatabase ?? null,
    databaseRemoved: r.databaseRemoved ?? false, hostingRemoved: r.hostingRemoved ?? false, cleanupErrors: (r.cleanupErrors ?? []).map(e => ({ resource: e.resource })),
    taskStatusCounts: counts(r.sql?.tasks), buildStatusCounts: counts(r.sql?.builds), publicationStatusCounts: counts(r.sql?.publications),
    models: { provider: r.modelProvider, calls: r.sql?.models?.length ?? null, inputTokens: null, outputTokens: null, paidRequests: r.paidModelRequests },
    publicAcceptance: r.publicAcceptance })
  if (existsSync(join(directory, 'browser.log'))) {
    // Public diagnostic derivative: remove private paths and insignificant trailing spaces.
    // The untouched original remains bound by the private run's raw log digest.
    writeFileSync(join(output, name + '-browser.log'), redact(readFileSync(join(directory, 'browser.log'), 'utf8')).replace(/[ \t]+$/gm, ''))
  }
}
save('full-runs.json', summaries)
const real = commands.filter(r => r.mode === 'real' && r.status !== 'RUNNING').at(-1)
if (real) copyFileSync(join(root, real.privateEvidence, 'model/t4-result.json'), join(output, 'real-model.json'))
const missing = commands.filter(r => r.mode === 'real-missing').at(-1)
if (missing) copyFileSync(join(root, missing.privateEvidence, 'model/t4-preflight.json'), join(output, 'missing-model.json'))
const exported = commands.filter(r => r.mode === 'export').at(-1)
if (exported) {
  copyFileSync(join(root, exported.privateEvidence, 'clean/clean-build.json'), join(output, 'clean-build.json'))
  copyFileSync(join(root, exported.privateEvidence, 'clean/clean-build.log'), join(output, 'clean-build.log'))
  const archive = exported.command[2]
  copyFileSync(resolve(root, archive), join(output, 'export-sample.zip'))
}
if (existsSync(join(root, '.local-data/d23-b/verify-export.json'))) copyFileSync(join(root, '.local-data/d23-b/verify-export.json'), join(output, 'verify-export.json'))
// Bootstrap predates this recorder. Copy the operator's observed native result; never infer exit zero from a log marker.
copyFileSync(join(root, '.local-data/d23-b/bootstrap.json'), join(output, 'bootstrap.json'))
const gate = commands.filter(r => r.mode === 'gate').at(-1)
if (gate && gate.status !== 'RUNNING') {
  const nestedRoot = join(root, '.local-data/d20-b/commands')
  const nested = readdirSync(nestedRoot).sort().filter(name => name.endsWith('-gate')).at(-1)
  const log = readFileSync(join(nestedRoot, nested, 'command.log'), 'utf8')
  const nestedReport = read(join(nestedRoot, nested, 'run.json'))
  const stages = ['static', 'api', 'runner', 'e2e']
  const segments = Object.fromEntries(stages.map((stage, index) => {
    const start = log.indexOf('[ci-gate] verify:' + stage)
    const end = index === stages.length - 1 ? log.length : log.indexOf('[ci-gate] verify:' + stages[index + 1])
    return [stage, start < 0 ? '' : log.slice(start, end < 0 ? log.length : end)]
  }))
  save('gate-summary.json', { status: gate.status, exitCode: gate.exitCode, signal: gate.signal,
    privateEvidence: relative(root, join(nestedRoot, nested)).replaceAll('\\', '/'), logDigest: sha(Buffer.from(log)),
    changedSources: nestedReport.changedSources, canonical: nestedReport.canonical,
    phaseNativeExitCodes: null, phaseExitNote: 'The root aggregator records only the overall native exit. Per-phase completion markers below are observations, not separately captured native exits.',
    stagesObserved: stages.filter(stage => segments[stage]),
    apiBuild: segments.api.includes('[INFO] BUILD SUCCESS') ? 'SUCCESS' : segments.api.includes('[INFO] BUILD FAILURE') ? 'FAILURE' : 'UNKNOWN',
    runnerTestSummary: Object.fromEntries([...segments.runner.matchAll(/^(?:#|ℹ) (tests|pass|fail|cancelled|skipped) (\d+)\s*$/gm)].map(m => [m[1], Number(m[2])])),
    e2eCompletionLines: segments.e2e.split(/\r?\n/).filter(line => /(?:\d+ passed|\d+ failed|"status":"(?:PASSED|FAILED)"|ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL)/.test(line)).map(redact) })
  const reports = join(root, 'services/api/target/surefire-reports')
  const suites = readdirSync(reports).filter(f => /^TEST-.*\.xml$/.test(f)).map(file => {
    const xml = readFileSync(join(reports, file), 'utf8'), head = xml.match(/<testsuite\b[^>]*>/)?.[0]
    if (!head) throw new Error('JUnit suite header missing')
    const attribute = (text, name) => text.match(new RegExp('\\b' + name + '="([^"]*)"'))?.[1]
    return { name: attribute(head, 'name'), ...Object.fromEntries(['tests', 'failures', 'errors', 'skipped'].map(name => {
      const value = attribute(head, name)
      if (value === undefined || !/^\d+$/.test(value)) throw new Error('Unknown JUnit count')
      return [name, Number(value)]
    })), failedCases: [...xml.matchAll(/<testcase\b([^>]*?)(?:\/>|>([\s\S]*?)<\/testcase>)/g)]
      .filter(m => /<(?:failure|error)\b/.test(m[2] ?? '')).map(m => attribute(m[1], 'name')) }
  })
  save('api-tests.json', { suiteCount: suites.length, totals: Object.fromEntries(['tests', 'failures', 'errors', 'skipped'].map(name => [name, suites.reduce((sum, s) => sum + s[name], 0)])), suites })
}
console.log(relative(root, output))
