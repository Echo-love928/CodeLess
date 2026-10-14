import { readdirSync, readFileSync, writeFileSync, mkdirSync, copyFileSync, existsSync } from 'node:fs'
import { join, relative, basename } from 'node:path'
import { createHash } from 'node:crypto'

const root = '.local-data/d14-b', output = 'tests/e2e/visual-edit/evidence/2026-10-14'
mkdirSync(output, { recursive: true })
const runs = readdirSync(root).filter(name => existsSync(join(root, name, 'run.json'))).map(name => {
  const meta = JSON.parse(readFileSync(join(root, name, 'run.json'), 'utf8'))
  if (meta.status === 'RUNNING') return { ...meta, directory: join(root, name), exportedResult: 'UNKNOWN' }
  const log = readFileSync(join(root, name, 'command.log'))
  if ('sha256:' + createHash('sha256').update(log).digest('hex') !== meta.logDigest) throw new Error('Log digest mismatch')
  const text = log.toString('utf8')
  // Full browser/static logs contain no platform sessions. API/gate raw logs stay private.
  const summary = ['unit', 'static', 'browser'].includes(meta.mode) ? text : text.split(/\r?\n/).filter(line =>
    /\[ci-gate\]|Tests run:|Tests:|Test Files|tests \d|pass \d|fail \d|skipped \d|\d+ passed|\d+ failed|BUILD SUCCESS|BUILD FAILURE|^\$|DirectoryNotEmptyException|AssertionError/.test(line)).join('\n') + '\n'
  writeFileSync(join(output, name + '.log'), summary)
  return { ...meta, directory: join(root, name), publicLog: name + '.log', rawLogIsPrivate: !['unit', 'static', 'browser'].includes(meta.mode) }
})
writeFileSync(join(output, 'commands.json'), JSON.stringify(runs, null, 2) + '\n')
for (const run of runs.filter(run => run.mode === 'browser' && run.status === 'PASSED' && existsSync(join(run.directory, 'browser-results.json')))) {
  const report = JSON.parse(readFileSync(join(run.directory, 'browser-results.json'), 'utf8'))
  function scan(suite) {
    for (const spec of suite.specs ?? []) for (const test of spec.tests) for (const result of test.results) {
      for (const attachment of result.attachments) if (attachment.name === 'four-scopes-and-versions') {
        if (result.status !== 'passed' || !attachment.body) throw new Error('Missing passed scope evidence')
        const proof = JSON.parse(Buffer.from(attachment.body, 'base64').toString('utf8'))
        if (!proof.namedFixture || proof.edits.length !== 4 || proof.selections.length !== 4) throw new Error('Incomplete four-scope evidence')
        writeFileSync(join(output, 'four-scopes.json'), JSON.stringify({ ...proof, commandRun: run.directory }, null, 2) + '\n')
      }
    }
    for (const nested of suite.suites ?? []) scan(nested)
  }
  for (const suite of report.suites) scan(suite)
}
for (const run of runs.filter(run => run.mode === 'integration' && run.status === 'PASSED')) {
  const combined = join(output, 'ab-integration'); mkdirSync(combined, { recursive: true })
  for (const name of ['D14-A-T1.json', 'D14-A-T2.json', 'D14-A-T3.json', 'D14-A-T4.json', 'restore-boundaries.json', 'restore-concurrency.json', 'runtime-usage.json'])
    copyFileSync(join(run.directory, 'verification', name), join(combined, name))
  for (const name of ['restore-original-0.png', 'restore-original-1.png'])
    copyFileSync(join(run.directory, 'verification', 'screenshots', name), join(combined, name))
  copyFileSync(join(run.directory, 'run.json'), join(combined, 'command.json'))
}
function files(dir) { return readdirSync(dir, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? files(join(dir, entry.name)) : [join(dir, entry.name)]) }
const browserArtifacts = join(root, 'browser-artifacts'); mkdirSync(browserArtifacts, { recursive: true })
if (existsSync('apps/web/test-results')) {
  const names = new Set(['four-edits.png', 'failure-recovery.png', 'mobile-edit-task.png', 'T4-shared.png', 'T4-shared-mobile.png'])
  for (const path of files('apps/web/test-results')) if (names.has(basename(path))) copyFileSync(path, join(browserArtifacts, basename(path)))
}
for (const name of readdirSync(browserArtifacts)) copyFileSync(join(browserArtifacts, name), join(output, name))
const digests = files(output).filter(path => !path.endsWith('artifact-digests.json')).map(path => ({ path: relative(output, path).replaceAll('\\', '/'), bytes: readFileSync(path).length,
  digest: 'sha256:' + createHash('sha256').update(readFileSync(path)).digest('hex') }))
writeFileSync(join(output, 'artifact-digests.json'), JSON.stringify(digests, null, 2) + '\n')
console.log(`Exported ${runs.length} actual command records and ${digests.length} artifacts`)
