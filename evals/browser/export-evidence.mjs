import { readdir, mkdir, readFile, writeFile, copyFile } from 'node:fs/promises'
import { resolve, join, basename } from 'node:path'
import { fileURLToPath } from 'node:url'
import { sha, readJSON } from './core.mjs'
const root = fileURLToPath(new URL('../../', import.meta.url))
const destination = join(root, 'evals/browser/evidence')
await mkdir(destination, { recursive: true })
const strip = value => typeof value === 'string' ? value.replaceAll(root, '<repo>').replaceAll(root.replaceAll('\\', '/'), '<repo>') : value
const browser = value => value ? { status: value.status, failure: value.failure, error: strip(value.error ?? null),
  pageErrors: value.pageErrors, consoleErrors: value.consoleErrors, blockedRequests: value.blockedRequests, failedRequests: value.failedRequests,
  screenshot: value.screenshot, trace: value.trace } : null
const build = value => value ? { status: value.status, exitCode: value.exitCode, failure: value.failure,
  imageId: value.imageId, artifactDigest: value.artifact?.digest ?? null, cleanup: value.cleanup } : null
for (const path of process.argv.slice(2)) {
  const full = resolve(path), report = await readJSON(full), directory = resolve(full, '..')
  const name = report.mode === 'MOCK' ? 'fixture' : 'real-batch'
  const rows = report.rows.map(row => ({ sampleId: row.sampleId, mode: row.mode, taskId: row.taskId ?? null,
    versionId: row.versionId ?? null, sourceDigest: row.sourceDigest, rawDigest: row.rawDigest ?? null,
    platform: row.platform ?? 'FIXTURE', platformFailureCode: row.platformFailureCode ?? null,
    originalVerification: row.originalVerification ?? null, build: build(row.build), browser: browser(row.browser), passed: row.passed, failure: row.failure }))
  const edits = report.edits.map(row => ({ sampleId: row.sampleId, mode: row.mode, passed: row.passed,
    status: row.status ?? (row.passed ? 'PASSED' : 'FAILED'), failure: row.failure,
    mapping: row.mapping ?? null, scope: row.scope ?? null, beforeDigest: row.beforeDigest ?? null, afterDigest: row.afterDigest ?? null,
    build: build(row.build), baselineBrowser: browser(row.baselineBrowser), browser: browser(row.browser) }))
  const exported = { schemaVersion: 1, originalReportDigest: sha(await readFile(full)), runId: basename(directory),
    revision: report.revision, changes: report.changes, startedAt: report.startedAt, completedAt: report.completedAt,
    status: report.status, mode: report.mode, statistics: report.statistics, batchId: report.batchId ?? null,
    batchDigest: report.batchDigest ?? null, runnerImage: report.runnerImage, fixtureBuild: build(report.fixtureBuild),
    additionalModelRequests: report.additionalModelRequests, additionalRuntimeTokens: report.additionalRuntimeTokens,
    rows, edits, controls: report.controls.map(control => ({ ...control, browser: browser(control.browser) })),
    requirements: { denominator: 9, real: report.requirements.real, mock: report.requirements.mock, unknown: report.requirements.unknown },
    editSummary: { denominator: 6, real: report.editSummary.real, mock: report.editSummary.mock, unknown: report.editSummary.unknown }, targets: report.targets }
  const shots = report.mode === 'MOCK'
    ? ['SHOW-03/page.png', 'TASK-01/page.png', 'CAT-03/page.png', 'EDIT-05/before/page.png', 'EDIT-05/after/page.png', 'controls/white-screen/page.png', 'controls/lost-persistence/page.png']
    : ['SHOW-01/page.png', 'SHOW-02/page.png', 'TASK-01/page.png']
  exported.publicScreenshots = shots.map(path => name + '-' + path.replaceAll('/', '-'))
  await writeFile(join(destination, name + '.json'), JSON.stringify(exported, null, 2) + '\n')
  for (const path of shots) await copyFile(join(directory, path), join(destination, name + '-' + path.replaceAll('/', '-')))
}
const commandRoot = join(root, '.local-data/d21-b/commands'), commands = []
try {
  for (const directory of await readdir(commandRoot)) {
    const record = await readJSON(join(commandRoot, directory, 'command.json'))
    commands.push({ ...record, command: record.command.map(strip), output: '.local-data/d21-b/commands/' + directory })
  }
} catch (error) { if (error.code !== 'ENOENT') throw error }
await writeFile(join(destination, 'commands.json'), JSON.stringify(commands, null, 2) + '\n')
const digests = {}
for (const name of await readdir(destination)) if (name !== 'digests.json') digests[name] = sha(await readFile(join(destination, name)))
await writeFile(join(destination, 'digests.json'), JSON.stringify(digests, null, 2) + '\n')
