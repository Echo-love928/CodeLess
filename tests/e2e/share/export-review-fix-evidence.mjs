// Preserve this review's actual command results separately from the initial failed gate.
import { readFile, writeFile, readdir, mkdir, copyFile } from 'node:fs/promises'
import { join, resolve, relative } from 'node:path'
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'

const root = resolve('.'), privateRoot = join(root, '.local-data/d16-b')
const output = join(root, 'tests/e2e/share/evidence/2026-10-19/review-fix')
const sha = bytes => 'sha256:' + createHash('sha256').update(bytes).digest('hex')
await mkdir(output, { recursive: true })
await writeFile(join(output, '.gitattributes'), '* -text\n')
const commands = []
for (const name of (await readdir(privateRoot)).sort()) {
  if (!/^2026-.*-(unit|screenshot|static|runner|e2e)$/.test(name)) continue
  const metadata = JSON.parse(await readFile(join(privateRoot, name, 'run.json'), 'utf8'))
  if (metadata.startedAt < '2026-10-19T13:50:00.000Z') continue
  const log = await readFile(join(privateRoot, name, 'command.log'))
  if (metadata.status === 'RUNNING' || metadata.logDigest !== sha(log)) throw new Error('Command incomplete or raw log changed')
  const { mode, command, startedAt, completedAt, status, exitCode, signal, head, changes, logDigest, sourceDigests } = metadata
  commands.push({ mode, command, startedAt, completedAt, status, exitCode, signal, head, changes, logDigest, sourceDigests,
    rawLog: relative(root, join(privateRoot, name, 'command.log')).replaceAll('\\', '/') })
}
await writeFile(join(output, 'commands.json'), JSON.stringify(commands, null, 2) + '\n')

const interop = JSON.parse(await readFile(join(privateRoot, 'live-interop/interop.json'), 'utf8'))
const repeated = JSON.parse(await readFile(join(privateRoot, 'live-interop-reproducible/interop.json'), 'utf8'))
if (interop.status !== 'PASSED' || repeated.status !== 'PASSED') throw new Error('Real HTTP interop failed')
for (const [from, to] of [['live-interop/interop.json', 'live-interop.json'], ['live-interop/download.zip', 'live-download.zip'],
  ['live-interop-reproducible/interop.json', 'live-interop-reproduced.json']])
  await copyFile(join(privateRoot, from), join(output, to))
const cleanBuildRaw = await readFile(join(privateRoot, 'live-interop/a-acceptance/D16-A-T1.json'))
const cleanBuildText = cleanBuildRaw.toString('utf8').replaceAll('\r\n', '\n')
await writeFile(join(output, 'a-clean-build.json'), cleanBuildText)
const download = await readFile(join(output, 'live-download.zip'))
const direct = await readFile(join(privateRoot, `live-interop/a-acceptance/export-${interop.versionId}.zip`))
if (!download.equals(direct) || sha(download) !== interop.archiveDigest) throw new Error('Owner download differs from A clean-build input')

const manual = []
for (const [name, count] of [['live-interop-maven.log', 6], ['live-interop-reproducible-maven.log', 1]]) {
  const raw = await readFile(join(privateRoot, name)), text = raw.toString('utf8')
  if (!text.includes(`Tests run: ${count}, Failures: 0, Errors: 0, Skipped: 0`) || !text.includes('BUILD SUCCESS'))
    throw new Error('Interop Maven completion not established')
  const lines = text.split(/\r?\n/).filter(line => /Tests run:|BUILD SUCCESS|Total time:|Finished at:/.test(line)).join('\n') + '\n'
  await writeFile(join(output, name + '.summary.txt'), lines)
  manual.push({ command: ['services/api/mvnw.cmd', '-f', 'services/api/pom.xml',
    `-Dtest=${count === 6 ? 'BSourceExportInteropTest' : 'BSourceExportInteropTest#bAdapterConsumesRealOwnerStreamAndRejectsOtherSessions'}`, 'test'],
    candidateApi: 'feb820c (API files unchanged at A 684ef36)', exitCode: 0, tests: count, failures: 0, errors: 0, skipped: 0,
    rawLog: '.local-data/d16-b/' + name, rawLogDigest: sha(raw), exportedSummaryDigest: sha(lines) })
}
await writeFile(join(output, 'interop-origin.json'), JSON.stringify({ commands: manual,
  firstRunHarness: 'private subclass with B root fixed to the local checkout; no production source changes',
  reproducibleHarness: 'tests/e2e/share/fixtures/BSourceExportInteropTest.java; private env-configured A test subclass',
  aReviewedHead: '684ef36153e978c29e3dbe4179e144f1208c8a2f',
  controllerBlob: 'fdd82a37e725936596a4bf8041070e2dd1c5fe96', archiveBlob: '50ba38d48ea2346baa37f111ce49222963da9165',
  cleanBuildReport: { rawPath: '.local-data/d16-b/live-interop/a-acceptance/D16-A-T1.json', rawDigest: sha(cleanBuildRaw),
    exportedDigest: sha(cleanBuildText), normalization: 'CRLF to LF only; original report retained privately' },
  exportedZipMatchesCleanBuildInput: true, modelProvider: 'deterministic-mock',
  limitations: ['No public hosting/cover HTTP integration claimed', 'Original Windows RepairLoop failure remains unresolved and preserved'],
}, null, 2) + '\n')

const paths = spawnSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z', '--',
  'services/runner/src/screenshot', 'apps/web/src/features/deploy', 'apps/web/src/features/source', 'tests/e2e/share'], { encoding: 'utf8' })
if (paths.status !== 0) throw new Error('Cannot establish tested sources')
const sources = {}
for (const path of [...new Set(paths.stdout.split('\0').filter(path => path && !path.includes('/evidence/')))]) {
  const bytes = await readFile(path)
  sources[path] = { digest: sha(bytes), lfDigest: sha(bytes.toString('utf8').replaceAll('\r\n', '\n')) }
}
await writeFile(join(output, 'source-digests.json'), JSON.stringify(sources, null, 2) + '\n')
console.log(JSON.stringify({ commands: commands.map(({ mode, status, exitCode }) => ({ mode, status, exitCode })), output }))
