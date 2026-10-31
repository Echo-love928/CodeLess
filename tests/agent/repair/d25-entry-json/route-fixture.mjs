// Real Docker/Vue/Chromium over a separately authored route/file proposal. Never replaces model scores.
import assert from 'node:assert/strict'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve, join, dirname } from 'node:path'
import { pathToFileURL } from 'node:url'
import { execFileSync } from 'node:child_process'
import { chromium } from '@playwright/test'
import { createBuildRunner } from '../../../../services/runner/src/build/runner.mjs'
const [batchArg, consumerArg, outputArg] = process.argv.slice(2)
assert.ok(batchArg && consumerArg && outputArg)
const batch = resolve(batchArg), consumer = resolve(consumerArg), output = resolve(outputArg)
const mod = path => import(pathToFileURL(join(consumer, path)).href)
const { loadBatch, manifest, safeFile, sha } = await mod('evals/browser/core.mjs')
const { inspect } = await mod('evals/browser/browser.mjs')
const revision = execFileSync('git', ['-c', 'safe.directory=' + consumer.replaceAll('\\', '/'), 'rev-parse', 'HEAD'], { cwd: consumer, encoding: 'utf8', windowsHide: true }).trim()
assert.equal(revision, '6e79faf6464f33c260d8c8e47efdce3b0b6dddd2')
const loaded = await loadBatch(batch), original = loaded.rows.find(row => row.sampleId === 'TASK-03')
assert.equal(original.record.task.status, 'READY')
const source = await safeFile(batch, 'samples/TASK-03/' + original.source.directory)
const before = await manifest(source); assert.equal(before.digest, original.version.sourceDigest)
await mkdir(output, { recursive: false })
const proposal = join(output, 'new-proposal-source'); await mkdir(proposal)
const changes = []
for (const file of before.files) {
  const target = file.path === 'src/pages/HomePage.vue' ? 'src/pages/TasksPage.vue' : file.path
  assert.match(target, /^src\/(?:pages|components)\/[A-Za-z][A-Za-z0-9_-]*\.vue$|^src\/data\/[A-Za-z][A-Za-z0-9_-]*\.ts$/)
  const bytes = await readFile(await safeFile(source, file.path)); assert.equal(sha(bytes), file.digest)
  await mkdir(dirname(join(proposal, target)), { recursive: true }); await writeFile(join(proposal, target), bytes, { flag: 'wx' })
  changes.push({ from: file.path, to: target, bytesUnchanged: true, digest: file.digest })
}
const build = await createBuildRunner({ workRoot: join(output, 'work'), artifactRoot: join(output, 'artifacts') })
const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => /^(?:PATH|SYSTEMROOT|WINDIR|USERPROFILE|HOME|TEMP|TMP|LOCALAPPDATA|PLAYWRIGHT_BROWSERS_PATH|LANG)$/i.test(k)))
const browser = await chromium.launch({ headless: true, env })
try {
  const old = await build(source); assert.equal(old.status, 'SUCCEEDED')
  const oldCanonical = await inspect(browser, old.artifact, { id: 'TASK-03', route: '/tasks', output: join(output, 'historical-tasks') })
  const oldPlanned = await inspect(browser, old.artifact, { id: 'TASK-03', route: '/', output: join(output, 'historical-root') })
  const next = await build(proposal); assert.equal(next.status, 'SUCCEEDED')
  const newCanonical = await inspect(browser, next.artifact, { id: 'TASK-03', route: '/tasks', output: join(output, 'new-proposal-tasks') })
  assert.equal(oldCanonical.status, 'FAILED'); assert.equal(oldPlanned.status, 'PASSED'); assert.equal(newCanonical.status, 'PASSED')
  assert.equal((await manifest(source)).digest, before.digest)
  const result = { kind: 'DETERMINISTIC_ROUTE_FIXTURE_NOT_REAL_MODEL_QUALITY', consumer: revision, originalBatch: loaded.batch.batchId,
    originalTaskId: original.record.task.id, originalVersionId: original.version.id, originalSourceDigest: before.digest,
    originalBytesUnchanged: true, originalFixedTasksFailureRetained: true, additionalModelRequests: 0,
    manuallyAuthoredNewProposal: { route: '/tasks', file: 'src/pages/TasksPage.vue', changes },
    historicalFixedTasks: oldCanonical, historicalPlannedRoot: oldPlanned, newCanonicalProposal: newCanonical,
    originalBuild: old, proposalBuild: next, status: 'PASSED', modifiesNineSampleScore: false }
  await writeFile(join(output, 'report.json'), JSON.stringify(result, null, 2) + '\n', { flag: 'wx' })
  console.log(JSON.stringify({ output, historicalTasks: oldCanonical.status, historicalRoot: oldPlanned.status,
    newProposalTasks: newCanonical.status, originalBytesUnchanged: true, additionalModelRequests: 0 }))
} finally { await browser.close() }
