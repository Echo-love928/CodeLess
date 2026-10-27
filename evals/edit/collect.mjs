// Read existing owner-visible tasks/snapshots and admin audit records. No task POSTs,
// provider calls, polling, redirects, or credentials in persisted output.
import assert from 'node:assert/strict'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { loadBatch, sha } from '../browser/core.mjs'
import { edits } from './cases.mjs'
import { uuid, snapshotSource } from './records.mjs'

export async function readPlatformSnapshot(get, id) {
  assert.ok(uuid(id))
  const version = await get('versions/' + id), snapshot = await get('versions/' + id + '/snapshot'), files = []
  assert.ok(Array.isArray(snapshot.files) && snapshot.files.length <= 40)
  for (const file of snapshot.files) {
    assert.match(file.path, /^src\/(?:pages|components)\/[A-Za-z][A-Za-z0-9_-]*\.vue$|^src\/data\/[A-Za-z][A-Za-z0-9_-]*\.ts$/)
    files.push(await get('versions/' + id + '/files/content?path=' + encodeURIComponent(file.path)))
  }
  const result = { version, snapshot, files }; snapshotSource(result); return result
}

export async function collect(batch, requests, destination, get) {
  assert.equal(requests.batchId, batch.batchId); assert.equal(requests.mode, batch.mode)
  assert.ok(Array.isArray(requests.tasks) && requests.tasks.length <= 6)
  const ids = new Set(), tasks = new Set()
  for (const request of requests.tasks) {
    assert.ok(edits.some(e => e.id === request.sampleId) && !ids.has(request.sampleId)); ids.add(request.sampleId)
    assert.ok(uuid(request.taskId) && !tasks.has(request.taskId)); tasks.add(request.taskId)
    assert.ok(request.versionId === null || uuid(request.versionId))
  }
  await mkdir(destination, { recursive: false })
  const index = { schemaVersion: 1, batchId: batch.batchId, mode: batch.mode, records: [] }
  const snapshot = id => readPlatformSnapshot(get, id)
  // A later API failure must not orphan already captured immutable records.
  await writeFile(resolve(destination, 'index.json'), JSON.stringify(index, null, 2) + '\n', { flag: 'wx' })
  for (const request of requests.tasks) {
    const edit = await get('tasks/' + request.taskId + '/edit')
    assert.equal(edit.task.id, request.taskId); assert.ok(uuid(edit.baseVersionId))
    assert.ok(['READY', 'FAILED'].includes(edit.task.status), 'Collect only terminal tasks; do not retry')
    if (edit.task.status === 'READY') assert.ok(uuid(request.versionId))
    const before = await snapshot(edit.baseVersionId)
    before.mapping = await get('versions/' + edit.baseVersionId + '/component-mapping')
    const record = { schemaVersion: 1, batchId: batch.batchId, sampleId: request.sampleId, mode: batch.mode,
      collection: { kind: 'PLATFORM_API', collectedAt: new Date().toISOString() }, edit, before,
      after: request.versionId ? await snapshot(request.versionId) : null,
      modelCalls: await get('admin/model-calls?taskId=' + request.taskId + '&page=0&size=100') }
    const raw = JSON.stringify(record, null, 2) + '\n'
    await writeFile(resolve(destination, request.sampleId + '.json'), raw, { flag: 'wx' })
    index.records.push({ sampleId: request.sampleId, digest: sha(raw) })
    await writeFile(resolve(destination, 'index.json'), JSON.stringify(index, null, 2) + '\n')
  }
  return index
}

export function apiReader(url, cookie, fetcher = fetch, auditCookie = cookie) {
  const base = new URL(url)
  assert.ok(!base.username && !base.password && !base.search && !base.hash && base.pathname === '/api/v0/')
  assert.ok(base.protocol === 'https:' || (base.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(base.hostname)))
  for (const value of [cookie, auditCookie]) assert.ok(typeof value === 'string' && value.length > 0 && !/[\r\n]/.test(value))
  return async path => {
    const target = new URL(path, base)
    assert.ok(target.origin === base.origin && target.pathname.startsWith(base.pathname), 'API read escaped configured origin')
    const response = await fetcher(target, { method: 'GET', redirect: 'error',
      headers: { Cookie: target.pathname.startsWith(base.pathname + 'admin/') ? auditCookie : cookie, Accept: 'application/json' }, signal: AbortSignal.timeout(10000) })
    assert.equal(response.status, 200, 'Read failed for ' + path.split('?')[0] + ': HTTP ' + response.status)
    const reader = response.body.getReader(), chunks = []; let size = 0
    try { for (;;) { const { done, value } = await reader.read(); if (done) break
      size += value.length; assert.ok(size <= 3145728, 'API response too large'); chunks.push(value) } }
    finally { await reader.cancel() }
    return JSON.parse(Buffer.concat(chunks).toString('utf8'))
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const [batchDir, requestFile, output] = process.argv.slice(2)
    assert.ok(batchDir && requestFile && output, 'Usage: collect.mjs <A-batch> <task-index.json> <new-output-directory>')
    const { batch } = await loadBatch(resolve(batchDir))
    const requests = JSON.parse(await readFile(requestFile, 'utf8'))
    const index = await collect(batch, requests, resolve(output), apiReader(process.env.CODELESS_EVAL_API_URL,
      process.env.CODELESS_EVAL_SESSION_COOKIE, fetch, process.env.CODELESS_EVAL_AUDIT_SESSION_COOKIE ?? process.env.CODELESS_EVAL_SESSION_COOKIE))
    console.log(JSON.stringify({ status: 'COLLECTED_NOT_YET_ACCEPTED', records: index.records.length, additionalModelRequests: 0 }))
  } catch (error) { console.error(JSON.stringify({ status: 'FAILED', error: error.code ?? (error.name === 'AssertionError' ? error.message.split('\n')[0] : 'API_READ_FAILED') })); process.exitCode = 1 }
}
