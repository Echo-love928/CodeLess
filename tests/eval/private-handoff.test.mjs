import test from 'node:test'
import assert from 'node:assert/strict'
import { safeMember, validateRetained, requireSeparateOutput, validateCoverage } from '../../scripts/eval/private-handoff.mjs'
import { resolve } from 'node:path'
import { CANDIDATE, IDS } from '../../scripts/eval/budgeted-batch.mjs'
const original = () => ({ sampleId: 'SHOW-01', batchId: 'fixed-real-batch', mode: 'REAL', platformRevision: CANDIDATE,
  application: { id: 'original-app' }, task: { id: 'original-task', status: 'FAILED', queueState: 'FINISHED' }, versions: [],
  files: [{ path: 'database.sql', sha256: 'sha256:' + 'a'.repeat(64) }, { path: 'schema.sql', sha256: 'sha256:' + 'b'.repeat(64) }] })
test('failed original tasks are retained without inventing versions or READY', () => {
  const r = original(); validateRetained(r, 'SHOW-01', 'fixed-real-batch'); assert.equal(r.task.status, 'FAILED'); assert.deepEqual(r.versions, [])
})
test('candidate, sample, batch, mode, pending tasks and missing database exports are refused', () => {
  for (const change of [r => { r.platformRevision = 'a863b76' }, r => { r.batchId = 'another' }, r => { r.sampleId = 'SHOW-02' },
    r => { r.mode = 'MOCK' }, r => { r.task.queueState = 'QUEUED' }, r => { r.files.pop() }]) {
    const r = original(); change(r); assert.throws(() => validateRetained(r, 'SHOW-01', 'fixed-real-batch'))
  }
})
test('archive listing allows normal original paths but rejects traversal, drives, backslashes and control characters', () => {
  assert.equal(safeMember('./retained/SHOW-01/private/versions/'), 'retained/SHOW-01/private/versions')
  for (const name of ['../private', './batch/../../outside', '/absolute', 'C:/private', 'batch\\..\\private', 'batch/evil\nname', 'batch//file'])
    assert.throws(() => safeMember(name))
})
test('output cannot recursively include itself under the original batch or retained tree', () => {
  const batch = resolve('fixture/batch'), retained = resolve('fixture/retained')
  assert.doesNotThrow(() => requireSeparateOutput(resolve('fixture/bundle'), [batch, retained]))
  for (const output of [batch, resolve(batch, 'bundle'), retained, resolve(retained, 'bundle')])
    assert.throws(() => requireSeparateOutput(output, [batch, retained]), /outside/)
})

test('partial handoff keeps the refused position explicit and rejects invented, missing or overlapping execution', () => {
  const refusal = { sampleId: 'FAULT-ENV-02', reason: 'CNY_BUDGET_NOT_STARTED', jvmStarted: false, recordPresent: false }
  assert.doesNotThrow(() => validateCoverage(IDS.slice(0, -1), [refusal]))
  assert.doesNotThrow(() => validateCoverage([...IDS], []))
  assert.throws(() => validateCoverage(IDS.slice(0, -1), []))
  assert.throws(() => validateCoverage([...IDS], [refusal]))
  assert.throws(() => validateCoverage(IDS.slice(0, -1), [{ ...refusal, jvmStarted: true }]))
  assert.throws(() => validateCoverage(IDS.slice(0, -1), [{ ...refusal, reason: 'IGNORE_FAILURE' }]))
})
