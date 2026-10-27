// Mechanical MOCK-only exercise of original restored identities, CSRF, component edit and collection.
import assert from 'node:assert/strict'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { randomUUID } from 'node:crypto'
const [runtimeArg, batchArg, bArg, outputArg] = process.argv.slice(2)
const runtime = resolve(runtimeArg), output = resolve(outputArg)
await mkdir(output, { recursive: false })
const readJSON = async path => JSON.parse(await readFile(path, 'utf8'))
const state = await readJSON(join(runtime, 'runtime.json')), session = await readJSON(join(runtime, 'session.private.json'))
assert.equal(state.mode, 'MOCK'); assert.equal(state.status, 'READY_FOR_PREFLIGHT')
const load = p => import(pathToFileURL(join(resolve(bArg), p)).href)
const { collect, apiReader } = await load('evals/edit/collect.mjs')
const { edits } = await load('evals/edit/cases.mjs')
const batch = await readJSON(join(resolve(batchArg), 'batch.json')); assert.equal(batch.mode, 'MOCK')
const get = apiReader(session.api, session.owner.cookie, fetch, session.audit.cookie)
const restore = await readJSON(join(runtime, 'restoration-check.json'))
const identity = restore.identities.find(v => v.sampleId === 'SHOW-01')
const before = await get('versions/' + identity.versionId), mapping = await get('versions/' + identity.versionId + '/component-mapping')
const component = mapping.components.find(v => v.sourceFile === 'src/components/ProfileCard.vue'); assert.ok(component)
const payload = { baseVersionId: before.id, prompt: edits[0].prompt, selection: { componentId: component.componentId, versionId: before.id, sourceDigest: before.sourceDigest } }
const response = await fetch(session.api + 'applications/' + identity.applicationId + '/component-edits', { method: 'POST', redirect: 'error',
  headers: { Cookie: session.owner.cookie, 'X-CSRF-Token': session.owner.csrf, 'Content-Type': 'application/json', 'Idempotency-Key': 'MOCK-smoke-' + randomUUID() }, body: JSON.stringify(payload) })
assert.equal(response.status, 202); const submitted = await response.json(), taskId = submitted.task.id
await writeFile(join(output, 'submission.json'), JSON.stringify({ mode: 'MOCK', payload, taskId }, null, 2))
const deadline = Date.now() + 180000; let terminal
do {
  terminal = await get('tasks/' + taskId + '/edit')
  if (['READY', 'FAILED'].includes(terminal.task.status)) break
  assert.ok(Date.now() < deadline); await new Promise(done => setTimeout(done, 1000))
} while (true)
assert.equal(terminal.task.status, 'READY')
const versionId = (await get('applications/' + identity.applicationId)).latestReadyVersionId
const after = await get('versions/' + versionId); assert.equal(after.taskId, taskId); assert.notEqual(after.id, before.id)
await collect(batch, { batchId: batch.batchId, mode: 'MOCK', tasks: [{ sampleId: 'EDIT-01', taskId, versionId }] }, join(output, 'records'), get)
const record = await readJSON(join(output, 'records/EDIT-01.json'))
assert.equal(record.before.version.id, before.id); assert.equal(record.after.version.id, versionId)
assert.equal(record.edit.source.type, 'COMPONENT'); assert.ok(record.modelCalls.items.length)
assert.ok(record.modelCalls.items.every(call => call.provider === 'deterministic-mock'))
const result = { status: 'PASSED_MECHANICAL_MOCK_ONLY', realModelCalls: 0, realEditsAccepted: 0, originalVersionId: before.id, editedVersionId: versionId, taskId, collectedRecords: 1 }
await writeFile(join(output, 'result.json'), JSON.stringify(result, null, 2) + '\n'); console.log(JSON.stringify(result))
