import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { validateEditRecord, snapshotSource, editBlocker, loadEditRecords } from '../../../evals/edit/records.mjs'
import { collect, apiReader } from '../../../evals/edit/collect.mjs'
import { mockRecord, writeBundle, refreshSnapshot } from './edit-record-fixture.mjs'
import { replayEdits } from '../../../evals/edit/replay.mjs'
import { manifest, sha } from '../../../evals/browser/core.mjs'
import { preflight } from '../../../evals/edit/handoff.mjs'
import { edits } from '../../../evals/edit/cases.mjs'

test('edit records bind task, server component selection, immutable versions and provider audit', async t => {
  const f = await mockRecord(t)
  const result = validateEditRecord(f.record, f.edit, f.base, f.batch, f.mapping, f.selection)
  assert.equal(result.task.id, f.record.edit.task.id); assert.equal(result.usage.totalTokens, 0)
  assert.equal(result.before.length, result.after.length)
  const changes = [r => { r.edit.task.id = f.base.record.task.id }, r => { r.edit.task.applicationId = randomUUID() },
    r => { r.edit.baseVersionId = randomUUID() }, r => { r.before.version.taskId = randomUUID() },
    r => { r.after.version.taskId = randomUUID() }, r => { r.after.version.buildId = randomUUID() },
    r => { r.edit.source.sourceFile = 'src/pages/Other.vue' }, r => { r.before.mapping.components[0].fileDigest = 'sha256:' + '0'.repeat(64) },
    r => { r.modelCalls.items[0].provider = 'deepseek' }, r => { r.modelCalls.totalItems = 2 },
    r => { r.modelCalls.items = [] }, r => { r.after.files[0].content += '\nmodified' },
    r => { r.after.files[0].path = '../outside.vue' }, r => { r.after.snapshot.validation.report.exitCode = null },
    r => { r.before.version.number = 0 },
    r => { r.before.version.buildId = randomUUID(); r.before.snapshot.validation.report.buildId = r.before.version.buildId },
    r => { r.after.version.buildId = r.before.version.buildId; r.after.snapshot.validation.report.buildId = r.before.version.buildId },
    r => { r.after.snapshot.validation.report.verificationId = r.before.snapshot.validation.report.verificationId }]
  for (const change of changes) { const record = structuredClone(f.record); change(record); assert.throws(() => validateEditRecord(record, f.edit, f.base, f.batch, f.mapping, f.selection)) }
})

test('edit records retain partial/unknown usage and executed failed tasks without a fake version', async t => {
  const f = await mockRecord(t), call = f.record.modelCalls.items[0]
  Object.assign(call, { status: 'FAILED', usage: 'UNKNOWN', inputTokens: 42, outputTokens: null, totalTokens: null })
  Object.assign(f.record.edit.task, { status: 'FAILED', failureCode: 'MODEL_NETWORK' }); f.record.after = null
  const result = validateEditRecord(f.record, f.edit, f.base, f.batch, f.mapping, f.selection)
  assert.equal(result.task.status, 'FAILED'); assert.equal(result.after, null)
  assert.equal(result.usage.unknownCalls, 1); assert.equal(result.usage.totalTokens, null)
  call.totalTokens = 0; assert.throws(() => validateEditRecord(f.record, f.edit, f.base, f.batch, f.mapping, f.selection))
})

test('edit blockers distinguish missing base, failed generation, mapping and missing edit task', async t => {
  const f = await mockRecord(t), base = { platform: 'READY', build: { status: 'SUCCEEDED' } }
  assert.equal(editBlocker(f.edit, null, null).failure, 'BASE_RECORD_MISSING')
  assert.equal(editBlocker(f.edit, { platform: 'FAILED', platformFailureCode: 'MODEL_NETWORK' }, null).failure, 'BASE_GENERATION_FAILED')
  assert.equal(editBlocker(f.edit, { platform: 'READY' }, null).failure, 'BASE_REPLAY_FAILED')
  assert.equal(editBlocker(f.edit, base, f.mapping).failure, 'EDIT_TASK_RECORD_REQUIRED')
  assert.equal(editBlocker(f.edit, base, null).mappingReason, 'CATALOG_UNAVAILABLE')
})

test('live handoff requires retained current API versions, snapshots, trusted mapping and audit access', async t => {
  const fixtures = [], rootByBase = new Map(), responses = new Map(), reportEdits = []
  for (const edit of edits) {
    const f = await mockRecord(t, edit.id, true); fixtures.push(f)
    if (!rootByBase.has(edit.base)) rootByBase.set(edit.base, f)
    const root = rootByBase.get(edit.base), b = root.record.before
    const target = root.mapping.components.find(c => c.sourceFile === f.edit.fixture.file)
    reportEdits.push({ sampleId: edit.id, beforeVersionId: b.version.id, beforeDigest: b.version.sourceDigest,
      baselineBrowser: { status: 'PASSED' }, trustedMapping: root.mapping,
      selection: { ...target, selectable: true, shared: true, versionId: b.version.id, sourceDigest: b.version.sourceDigest } })
  }
  const batch = fixtures[0].batch, batchDigest = sha('raw batch bytes'), loaded = { batch, batchDigest,
    rows: [...rootByBase].map(([sampleId, f]) => ({ sampleId, record: { task: { ...f.base.record.task, status: 'READY' } }, version: f.base.version })) }
  const report = { batchId: batch.batchId, batchDigest, mode: 'MOCK', edits: reportEdits }
  for (const f of rootByBase.values()) {
    const b = f.record.before, p = 'versions/' + b.version.id
    responses.set('applications/' + b.version.applicationId, { id: b.version.applicationId, latestReadyVersionId: b.version.id })
    responses.set(p, b.version); responses.set(p + '/snapshot', b.snapshot); responses.set(p + '/component-mapping', f.mapping)
    for (const file of b.files) responses.set(p + '/files/content?path=' + encodeURIComponent(file.path), file)
    responses.set('admin/model-calls?taskId=' + b.version.taskId + '&page=0&size=100', { items: [{ taskId: b.version.taskId, provider: batch.provider.id }] })
  }
  const get = async p => { assert.ok(responses.has(p), p); return structuredClone(responses.get(p)) }
  const ready = await preflight(loaded, report, get)
  assert.equal(ready.status, 'PREFLIGHT_READY'); assert.equal(ready.tasks.length, 6); assert.equal(ready.realEditsExecuted, 0)
  assert.ok(ready.tasks.every(r => r.passed === null && !('sourceFile' in r.request.selection)))
  assert.equal(ready.tasks[1].selection.sourceFile, 'src/components/PortfolioTile.vue')
  const first = rootByBase.get('SHOW-01').record.before.version
  const app = responses.get('applications/' + first.applicationId); app.latestReadyVersionId = randomUUID()
  const stale = await preflight(loaded, report, get)
  assert.equal(stale.status, 'BLOCKED'); assert.equal(stale.tasks.filter(r => r.status === 'PREFLIGHT_READY').length, 2)
  app.latestReadyVersionId = first.id
  const gone = await preflight(loaded, report, async () => { throw Object.assign(new Error('Do not persist response/session'), { code: 'ECONNREFUSED' }) })
  assert.equal(gone.status, 'BLOCKED'); assert.ok(gone.tasks.every(r => r.failure === 'LIVE_BASE_UNAVAILABLE_OR_MISMATCH'))
  assert.ok(!JSON.stringify(gone).includes('Do not persist'))
  await assert.rejects(preflight(loaded, { ...report, batchDigest: sha('different bytes') }, get))
  responses.get('versions/' + first.id + '/component-mapping').components[0].fileDigest = sha('tampered')
  const tampered = await preflight(loaded, report, get)
  assert.equal(tampered.status, 'BLOCKED')
})

test('collector keeps an indexed first task if a later live read fails', async t => {
  const first = await mockRecord(t), second = await mockRecord(t, 'EDIT-04'), responses = new Map()
  const r = first.record
  responses.set('tasks/' + r.edit.task.id + '/edit', r.edit)
  responses.set('versions/' + r.before.version.id + '/component-mapping', first.mapping)
  responses.set('admin/model-calls?taskId=' + r.edit.task.id + '&page=0&size=100', r.modelCalls)
  for (const value of [r.before, r.after]) {
    const p = 'versions/' + value.version.id
    responses.set(p, value.version); responses.set(p + '/snapshot', value.snapshot)
    for (const file of value.files) responses.set(p + '/files/content?path=' + encodeURIComponent(file.path), file)
  }
  const output = join(first.directory, 'partial')
  await assert.rejects(collect(first.batch, { batchId: first.batch.batchId, mode: 'MOCK', tasks: [
    { sampleId: first.edit.id, taskId: r.edit.task.id, versionId: r.after.version.id },
    { sampleId: second.edit.id, taskId: second.record.edit.task.id, versionId: second.record.after.version.id }] }, output,
    async p => { assert.ok(responses.has(p)); return structuredClone(responses.get(p)) }))
  assert.equal((await loadEditRecords(output, first.batch)).size, 1)
  assert.equal(validateEditRecord((await loadEditRecords(output, first.batch)).get(first.edit.id).record,
    first.edit, first.base, first.batch, first.mapping, first.selection).task.id, r.edit.task.id)
})

test('edit bundle detects record modification and duplicate task IDs', async t => {
  const f = await mockRecord(t), dir = join(f.directory, 'bundle')
  await writeBundle(dir, f.batch, [f.record]); assert.equal((await loadEditRecords(dir, f.batch)).size, 1)
  await writeFile(join(dir, f.edit.id + '.json'), '{}'); await assert.rejects(loadEditRecords(dir, f.batch))
  const other = structuredClone(f.record); other.sampleId = 'EDIT-02'
  await writeBundle(dir, f.batch, [f.record, other]); await assert.rejects(loadEditRecords(dir, f.batch))
})

test('collector reads existing task, both snapshots/files, mapping and audit without creating tasks', async t => {
  const f = await mockRecord(t), calls = [], responses = new Map([
    ['tasks/' + f.record.edit.task.id + '/edit', f.record.edit],
    ['versions/' + f.record.before.version.id + '/component-mapping', f.mapping],
    ['admin/model-calls?taskId=' + f.record.edit.task.id + '&page=0&size=100', f.record.modelCalls] ])
  for (const value of [f.record.before, f.record.after]) {
    const p = 'versions/' + value.version.id
    responses.set(p, value.version); responses.set(p + '/snapshot', value.snapshot)
    for (const file of value.files) responses.set(p + '/files/content?path=' + encodeURIComponent(file.path), file)
  }
  const dir = join(f.directory, 'collected')
  const get = apiReader('http://127.0.0.1:1/api/v0/', 'private-session', async (url, options) => {
    assert.equal(options.method, 'GET'); assert.equal(options.redirect, 'error'); assert.equal(options.headers.Cookie, 'private-session')
    const key = url.pathname.replace('/api/v0/', '') + url.search; calls.push(key); assert.ok(responses.has(key), key)
    return new Response(JSON.stringify(responses.get(key)))
  })
  await collect(f.batch, { batchId: f.batch.batchId, mode: 'MOCK', tasks: [{ sampleId: f.edit.id, taskId: f.record.edit.task.id, versionId: f.record.after.version.id }] }, dir, get)
  const record = (await loadEditRecords(dir, f.batch)).get(f.edit.id).record
  assert.equal(validateEditRecord(record, f.edit, f.base, f.batch, f.mapping, f.selection).task.id, f.record.edit.task.id)
  assert.ok(!String(await readFile(join(dir, f.edit.id + '.json'))).includes('private-session'))
  assert.ok(calls.some(p => p.startsWith('admin/model-calls')))
  await assert.rejects(get('https://other.example/api/v0/tasks'))
  await assert.rejects(collect(f.batch, { batchId: 'foreign', mode: 'MOCK', tasks: [] }, join(f.directory, 'bad'), get))
})

test('snapshot validation rejects duplicate/aliased files and aggregate digest changes', async t => {
  const f = await mockRecord(t)
  assert.ok(snapshotSource(f.record.before).length > 0)
  f.record.before.files.push(f.record.before.files[0]); assert.throws(() => snapshotSource(f.record.before))
})

test('collector separates owner/admin sessions and rejects credentials in origin or redirects', async () => {
  const requests = []
  const get = apiReader('http://127.0.0.1:1/api/v0/', 'owner-session', async (url, options) => {
    requests.push({ path: url.pathname, cookie: options.headers.Cookie }); return new Response('{}')
  }, 'admin-session')
  await get('versions/one'); await get('admin/model-calls')
  assert.deepEqual(requests.map(r => r.cookie), ['owner-session', 'admin-session'])
  await assert.rejects(get('../../outside')); await assert.rejects(get('//foreign.example/api/v0/'))
  assert.throws(() => apiReader('https://user:password@example.com/api/v0/', 'owner-session'))
  const redirected = apiReader('http://127.0.0.1:1/api/v0/', 'owner-session', async () => new Response(null, { status: 302 }))
  await assert.rejects(redirected('versions/one'))
})

test('edit replay rejects an unproven ancestor before invoking any build or browser', async t => {
  const f = await mockRecord(t)
  f.record.edit.baseVersionId = randomUUID()
  const result = await replayEdits({ loaded: { batch: f.batch, rows: [{ sampleId: f.edit.base, ...f.base }] },
    rows: [{ sampleId: f.edit.base, platform: 'READY', build: { status: 'SUCCEEDED' } }], mappings: new Map([[f.edit.base, f.mapping]]),
    records: new Map([[f.edit.id, { record: f.record, digest: 'fixture-only' }]]),
    build: () => { throw new Error('Must not build an unproven ancestor') }, browser: null, output: join(f.directory, 'replay'), inspectPage: async () => { throw new Error('Must not inspect an unproven ancestor') } })
  assert.equal(result[0].mode, 'UNKNOWN'); assert.equal(result[0].failure, 'EDIT_EVIDENCE_OR_HARNESS')
  assert.equal(result[0].passed, false)
})

test('edit replay rejects unrelated-file drift even when every browser assertion passes', async t => {
  const f = await mockRecord(t)
  await writeFile(join(f.candidate, 'src/data/stable.ts'), 'export const changed = true\n')
  await refreshSnapshot(f.record.after, f.candidate)
  const { chromium } = await import('@playwright/test')
  const { inspect } = await import('../../../evals/browser/browser.mjs')
  const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => /^(PATH|SYSTEMROOT|WINDIR|USERPROFILE|HOME|TEMP|TMP|LOCALAPPDATA|PLAYWRIGHT_BROWSERS_PATH|LANG)$/i.test(k)))
  const browser = await chromium.launch({ headless: true, env }); t.after(() => browser.close())
  const artifact = join(f.directory, 'mock-artifact'); await mkdir(artifact)
  const html = async (name, text) => {
    const directory = join(f.directory, name); await mkdir(directory)
    const content = '<html><meta charset="utf-8"><body><main data-ai-component="home-page"><h1>' + text + '</h1></main></body></html>'
    await writeFile(join(directory, 'index.html'), content)
    return { directory, files: [{ path: 'index.html', digest: (await import('../../../evals/browser/core.mjs')).sha(content) }] }
  }
  const beforeArtifact = await html('dom-before', f.edit.before), afterArtifact = await html('dom-after', f.edit.after)
  const build = async source => {
    const m = await manifest(source)
    await writeFile(join(artifact, 'ai-component-catalog.json'), JSON.stringify({ protocol: 'codeless-component-catalog/v1',
      files: f.mapping.components.map(c => ({ sourceFile: c.sourceFile, fileDigest: m.files.find(v => v.path === c.sourceFile).digest,
        componentId: c.componentId, disabledReason: null })) }))
    return { status: 'SUCCEEDED', exitCode: 0, artifact: { ...afterArtifact, directory: artifact } }
  }
  const result = await replayEdits({ loaded: { batch: f.batch, rows: [{ sampleId: f.edit.base, ...f.base }] },
    rows: [{ sampleId: f.edit.base, platform: 'READY', build: { status: 'SUCCEEDED', artifact: beforeArtifact } }], mappings: new Map([[f.edit.base, f.mapping]]),
    records: new Map([[f.edit.id, { record: f.record, digest: 'fixture-only' }]]), build, browser: null,
    output: join(f.directory, 'replay'), inspectPage: (b, a, options) => options.output.includes('EDIT-01') ? inspect(browser, a.directory === artifact ? afterArtifact : a, options) : Promise.resolve({ status: 'FAILED', failure: 'BEHAVIOR_ERROR' }) })
  assert.equal(result[0].failure, 'EDIT_SCOPE'); assert.equal(result[0].passed, false)
  assert.deepEqual(result[0].scope.unrelated, ['src/data/stable.ts'])
})
