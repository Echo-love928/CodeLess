import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { readFile, mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'

// Match the other infra entries: prepare the shared image before registering tests.
// Rebuilding after Chromium controls can delete an image ID pinned by mapping tests
// on Docker Desktop's containerd image store.
const cwd = fileURLToPath(new URL('../../', import.meta.url))
const image = spawnSync('docker', ['build', '--file', 'infra/build-image/Dockerfile', '--tag', 'codeless-vue-build:d05', '.'], { cwd, encoding: 'utf8', timeout: 180000, windowsHide: true })
assert.equal(image.error, undefined)
assert.equal(image.signal, null)
assert.equal(image.status, 0, image.stderr)
await import('../eval/browser/core.test.mjs')
await import('../eval/browser/batch.test.mjs')
await import('../eval/browser/behavior.test.mjs')
await import('../eval/browser/names.test.mjs')
await import('../eval/browser/edit-records.test.mjs')

let fixtureReport
test('D21-B real Docker/Vue/Chromium: nine behaviors, six edits and negative controls', { timeout: 240000 }, async () => {
  const result = spawnSync(process.execPath, ['evals/browser/run.mjs', '--fixture'], { cwd, encoding: 'utf8', timeout: 210000, windowsHide: true })
  console.log(result.stdout)
  assert.equal(result.signal, null)
  assert.equal(result.error, undefined)
  assert.equal(result.status, 0, result.stderr + result.stdout)
  const { output } = JSON.parse(result.stdout.trim().split(/\r?\n/).at(-1))
  fixtureReport = JSON.parse(await readFile(join(output, 'report.json')))
})

test('D21-B MOCK API record collection and six independent Docker/browser edit replays', { timeout: 240000 }, async t => {
  assert.ok(fixtureReport, 'Original Docker fixture must complete first')
  const { chromium } = await import('@playwright/test')
  const { mockRecord, refreshSnapshot } = await import('../eval/browser/edit-record-fixture.mjs')
  const { changeFixture } = await import('../../evals/browser/fixture.mjs')
  const { collect } = await import('../../evals/edit/collect.mjs')
  const { loadEditRecords } = await import('../../evals/edit/records.mjs')
  const { replayEdits } = await import('../../evals/edit/replay.mjs')
  const { createBuildRunner } = await import('../../services/runner/src/build/runner.mjs')
  const { inspect } = await import('../../evals/browser/browser.mjs')
  const { bindCatalog } = await import('../../services/runner/src/mapping/manifest.mjs')
  const { edits } = await import('../../evals/edit/cases.mjs')
  const directory = join(cwd, '.local-data/d21-b/edits', randomUUID().slice(0, 8))
  await mkdir(directory, { recursive: true })
  const build = await createBuildRunner({ workRoot: join(directory, 'work'), artifactRoot: join(directory, 'artifacts') })
  const rootFixture = await mockRecord(t, 'EDIT-01', true)
  const rootBuild = await build(rootFixture.source)
  assert.equal(rootBuild.status, 'SUCCEEDED')
  const catalog = JSON.parse(await readFile(join(rootBuild.artifact.directory, 'ai-component-catalog.json')))
  const roots = new Map(), previous = new Map(), records = [], loaded = { batch: null, rows: [] }, rows = [], mappings = new Map(), responses = new Map()
  for (const edit of edits) {
    const f = await mockRecord(t, edit.id, true); loaded.batch ??= f.batch
    if (!roots.has(edit.base)) {
      f.mapping = bindCatalog({ catalog, sourceManifest: { files: f.record.before.snapshot.files, digest: f.record.before.version.sourceDigest },
        versionId: f.record.before.version.id, sourceDigest: f.record.before.version.sourceDigest })
      f.record.before.mapping = f.mapping
      roots.set(edit.base, f); mappings.set(edit.base, f.mapping)
      loaded.rows.push({ sampleId: edit.base, ...f.base }); rows.push({ sampleId: edit.base, platform: 'READY', build: rootBuild })
    }
    const root = roots.get(edit.base), r = f.record
    r.before = previous.has(edit.base) ? structuredClone(previous.get(edit.base)) : root.record.before
    const currentCatalog = { ...catalog, files: catalog.files.map(file => ({ ...file,
      fileDigest: r.before.snapshot.files.find(f => f.path === file.sourceFile)?.digest ?? file.fileDigest })) }
    r.before.mapping = bindCatalog({ catalog: currentCatalog, sourceManifest: { files: r.before.snapshot.files, digest: r.before.version.sourceDigest },
      versionId: r.before.version.id, sourceDigest: r.before.version.sourceDigest })
    for (const file of r.before.files) await writeFile(join(f.candidate, file.path), file.content)
    await changeFixture(f.candidate, f.edit); await refreshSnapshot(r.after, f.candidate)
    r.edit.baseVersionId = r.before.version.id
    r.edit.source.versionId = r.before.version.id; r.edit.source.sourceDigest = r.before.version.sourceDigest
    r.edit.task.applicationId = r.before.version.applicationId
    r.after.version.applicationId = r.before.version.applicationId; r.after.version.number = r.before.version.number + 1
    r.modelCalls.items[0].applicationId = r.before.version.applicationId
    previous.set(edit.base, r.after)
    records.push(r)
    responses.set('tasks/' + r.edit.task.id + '/edit', r.edit)
    responses.set('admin/model-calls?taskId=' + r.edit.task.id + '&page=0&size=100', r.modelCalls)
    responses.set('versions/' + r.before.version.id + '/component-mapping', r.before.mapping)
    for (const value of [r.before, r.after]) {
      const p = 'versions/' + value.version.id
      responses.set(p, value.version); responses.set(p + '/snapshot', value.snapshot)
      for (const file of value.files) responses.set(p + '/files/content?path=' + encodeURIComponent(file.path), file)
    }
  }
  const bundle = join(directory, 'api-records')
  await collect(loaded.batch, { batchId: loaded.batch.batchId, mode: 'MOCK', tasks: records.map(r => ({ sampleId: r.sampleId,
    taskId: r.edit.task.id, versionId: r.after.version.id })) }, bundle, async p => { assert.ok(responses.has(p), p); return structuredClone(responses.get(p)) })
  const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => /^(PATH|SYSTEMROOT|WINDIR|USERPROFILE|HOME|TEMP|TMP|LOCALAPPDATA|PLAYWRIGHT_BROWSERS_PATH|LANG)$/i.test(k)))
  const browser = await chromium.launch({ headless: true, env })
  try {
    const result = await replayEdits({ loaded, rows, mappings, records: await loadEditRecords(bundle, loaded.batch), build, browser, output: directory,
      // This test's named fixture has all nine examples behind a query selector.
      // Real records always use the unmodified, query-free production inspector.
      inspectPage: (b, artifact, options) => {
        const id = edits.find(e => options.output.includes(e.id)).base
        return inspect(b, artifact, { ...options, query: '?case=' + id })
      } })
    await writeFile(join(directory, 'report.json'), JSON.stringify({ mode: 'MOCK', realEditsExecuted: 0, additionalModelRequests: 0, edits: result }, null, 2))
    console.log(JSON.stringify({ editRecordReplay: directory, mode: 'MOCK', passed: result.filter(r => r.passed).length, total: result.length }))
    assert.equal(result.find(r => r.sampleId === 'EDIT-02').targetFile, 'src/components/PortfolioTile.vue')
    assert.equal(result.find(r => r.sampleId === 'EDIT-01').componentId, 'profile-shell')
    assert.ok(result.every(r => r.mode === 'MOCK' && r.passed && r.scope.passed && r.beforeVersionId !== r.afterVersionId), JSON.stringify(result))
  } finally { await browser.close() }
})
