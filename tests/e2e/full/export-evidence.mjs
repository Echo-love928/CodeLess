// Publish portable summaries only. Raw traces can contain fixture session cookies.
import assert from 'node:assert/strict'
import { readdir, readFile, writeFile, mkdir, copyFile } from 'node:fs/promises'
import { join, relative } from 'node:path'
import { createHash } from 'node:crypto'
import { root } from './support.mjs'

const privateRoot = join(root, '.local-data/d20-b'), destination = join(root, 'tests/e2e/full/evidence')
await mkdir(destination, { recursive: true })
const read = async path => JSON.parse(await readFile(path, 'utf8'))
const sha = bytes => 'sha256:' + createHash('sha256').update(bytes).digest('hex')
const portable = path => relative(root, path).replaceAll('\\', '/')
const save = (name, value) => writeFile(join(destination, name), JSON.stringify(value, null, 2) + '\n')
async function records(folder) {
  const names = await readdir(join(privateRoot, folder)).catch(() => [])
  return Promise.all(names.sort().map(async name => ({ directory: join(privateRoot, folder, name),
    report: await read(join(privateRoot, folder, name, 'run.json')) })))
}
const full = await records('runs'), commands = await records('commands')
const successful = full.filter(({ report }) => report.status === 'PASSED' && report.canonical).slice(-2)
assert.equal(successful.length, 2, 'Two successful clean-checkout, clean-database runs are required')
assert.notEqual(successful[0].report.databaseId, successful[1].report.databaseId)
for (const [index, { directory, report }] of successful.entries()) {
  await save(`full-${index + 1}.json`, { ...report, output: portable(directory) })
  const identities = await read(join(directory, 'identities.json'))
  await save(`identities-${index + 1}.json`, identities)
}
const selected = successful.at(-1)
for (const name of ['user-1-complete.png', 'user-2-complete.png', 'failed-edit-keeps-old-version.png',
  'user-1-export.json', 'user-2-export.json', 'historical-export.json']) await copyFile(join(selected.directory, name), join(destination, name))
await save('full-history.json', full.map(({ directory, report }) => ({ directory: portable(directory),
  status: report.status, revision: report.revision, canonical: report.canonical ?? false,
  sourceManifestDigest: sha(JSON.stringify(report.sources)), startedAt: report.startedAt, completedAt: report.completedAt,
  browserExitCode: report.browserExitCode ?? null, browserSignal: report.browserSignal ?? null, retries: report.retries,
  error: report.error ?? null, changedSources: report.changedSources ?? [], cleanupErrors: report.cleanupErrors ?? [],
  databaseRemoved: report.databaseRemoved ?? null, hostingRemoved: report.hostingRemoved ?? null })))
await save('commands.json', commands.map(({ directory, report }) => ({ ...report, sources: undefined,
  sourceManifestDigest: sha(JSON.stringify(report.sources)), directory: portable(directory) })))
const proofs = (await readdir(privateRoot)).filter(name => /^failure-proof-.*\.json$/.test(name)).sort()
assert.ok(proofs.length > 0)
const proof = await read(join(privateRoot, proofs.at(-1)))
await save('failure-artifact-proof.json', { ...proof, directory: portable(proof.directory) })
const latestGate = commands.filter(({ report }) => report.mode === 'gate').at(-1)
const summary = { task: 'D20-B', exportedAt: new Date().toISOString(), canonicalFullRuns: successful.map(({ report }) => ({
  revision: report.revision, startedAt: report.startedAt, status: report.status, browserExitCode: report.browserExitCode,
  retries: report.retries, databaseId: report.databaseId, cleanDatabase: report.cleanDatabase })),
  distinctCleanDatabases: true, negativeProof: { status: proof.status, negativeNativeExitCode: proof.negativeNativeExitCode, taskId: proof.taskId },
  localGate: latestGate ? { status: latestGate.report.status, exitCode: latestGate.report.exitCode, revision: latestGate.report.revision,
    canonical: latestGate.report.canonical, directory: portable(latestGate.directory) } : { status: 'NOT_RUN' },
  realModelAcceptance: 'NOT_RUN_SEPARATE_EVALUATION', productionPublicDnsTlsAcceptance: 'NOT_CLAIMED_LOCAL_HTTPS_FIXTURE' }
await save('summary.json', summary)
console.log(JSON.stringify({ destination, canonicalFullRuns: successful.length, localGate: summary.localGate, failureProof: proof.status }))
