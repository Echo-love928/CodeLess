// Read-only check of restored original versions; never starts editing or a model request.
import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { loadBatch } from '../../evals/browser/core.mjs'
import { apiReader } from '../../evals/edit/collect.mjs'
import { preflight } from '../../evals/edit/handoff.mjs'
import { CANDIDATE } from './budgeted-batch.mjs'
const [runtimePath, batchPath, behaviorPath, outputPath] = process.argv.slice(2)
assert.ok(runtimePath && batchPath && behaviorPath && outputPath,
  'retained-preflight.mjs <private-runtime> <original-batch> <behavior-report> <new-output>')
const read = path => JSON.parse(readFileSync(path, 'utf8'))
const runtime = resolve(runtimePath), session = read(join(runtime, 'session.private.json'))
const state = read(join(runtime, 'runtime.json')), identity = read(join(runtime, 'restoration-check.json'))
const url = new URL(session.api)
assert.equal(url.protocol, 'http:'); assert.equal(url.hostname, '127.0.0.1'); assert.equal(url.pathname, '/api/v0/')
assert.equal(state.platformRevision, CANDIDATE); assert.equal(state.status, 'READY_FOR_PREFLIGHT')
assert.equal(identity.status, 'PASSED')
const loaded = await loadBatch(resolve(batchPath)), report = read(resolve(behaviorPath))
assert.equal(loaded.batch.git.head, CANDIDATE); assert.equal(loaded.batch.mode, 'REAL')
assert.equal(state.batchId, loaded.batch.batchId)
const get = apiReader(session.api, session.owner.cookie, fetch, session.audit.cookie)
const result = await preflight(loaded, report, get)
assert.equal(result.tasks.length, 6)
const counts = []
for (const sample of identity.identities) {
  const calls = await get('admin/model-calls?taskId=' + sample.taskId + '&page=0&size=100', true)
  assert.equal(calls.items.length, sample.modelCalls)
  assert.ok(calls.items.every(call => call.taskId === sample.taskId))
  counts.push({ sampleId: sample.sampleId, taskId: sample.taskId, originalModelCalls: sample.modelCalls, currentModelCalls: calls.items.length })
}
const value = { generatedAt: new Date().toISOString(), kind: 'ORIGINAL_CANDIDATE_READONLY_HANDOFF',
  candidate: CANDIDATE, batchId: loaded.batch.batchId, api: state.api, restorationStatus: identity.status,
  identities: identity.identities, preflight: result, modelCallCounts: counts,
  additionalModelRequests: 0, realEditsExecuted: 0,
  limitation: 'A self-check only; B must independently recheck identity, session validity, and current-version mapping. Loopback URLs and sessions cannot be reused across devices. No public-page, cover, download, editing or permission acceptance is claimed.',
  retention: 'A keeps original DB exports, immutable versions and private roots until B confirms terminal evidence and archive digests.' }
writeFileSync(resolve(outputPath), JSON.stringify(value, null, 2) + '\n', { flag: 'wx' })
console.log(JSON.stringify({ output: outputPath, status: result.status,
  tasks: result.tasks.map(t => ({ id: t.sampleId, status: t.status, failure: t.failure })), additionalModelRequests: 0, realEditsExecuted: 0 }))
process.exitCode = result.status === 'PREFLIGHT_READY' ? 0 : 1
