import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { verifiedEntryEvidence } from '../../../scripts/eval/verified-entry-evidence.mjs'
const root = new URL('../../../evals/results/D25-A/six-edits-2026-10-30/', import.meta.url)
const inputs = id => [JSON.parse(readFileSync(new URL('records/' + id + '.json', root))),
  JSON.parse(readFileSync(new URL('execution/' + id + '-journal.json', root)))]

test('original native records bind the two public home pages and the actual tasks entry', () => {
  for (const [id, path] of [['EDIT-05', '/'], ['EDIT-04', '/'], ['EDIT-06', '/tasks']]) {
    const proof = verifiedEntryEvidence(...inputs(id))
    assert.equal(proof.entryPath, path); assert.equal(proof.productionCoverRouteEnabled, false)
  }
})
test('model/mock labels, another version and source/artifact swaps cannot supply entry proof', () => {
  for (const change of [
    (r, _j) => { r.mode = 'MOCK' },
    (_r, j) => { j.find(e => e.kind === 'draft').payload.versionId = '11111111-1111-4111-8111-111111111111' },
    (_r, j) => { j.find(e => e.kind === 'draft').payload.sourceDigest = 'sha256:' + '0'.repeat(64) },
    (_r, j) => { j.find(e => e.kind === 'runner.result').payload.verification.artifactDigest = 'sha256:' + '0'.repeat(64) },
  ]) { const [r, j] = inputs('EDIT-06'); change(r, j); assert.throws(() => verifiedEntryEvidence(r, j)) }
})
test('unsafe, unverified or ambiguous entry paths never become functional-cover proof', () => {
  for (const path of ['http://127.0.0.1/', '//169.254.169.254/', '/tasks?next=1', '/tasks#x', '/catalog/../tasks']) {
    const [r, j] = inputs('EDIT-06'); j.find(e => e.kind === 'draft').payload.actions[0].path = path
    assert.throws(() => verifiedEntryEvidence(r, j), /ENTRY_PATH_REJECTED/)
  }
  const [r, j] = inputs('EDIT-06'); j.find(e => e.kind === 'draft').payload.actions.push({ type: 'navigate', path: '/' })
  assert.throws(() => verifiedEntryEvidence(r, j), /ENTRY_PATH_AMBIGUOUS/)
})
test('a browser failure or failed navigation preserves unknown entry verification', () => {
  const [r, j] = inputs('EDIT-06'), native = j.find(e => e.kind === 'runner.result').payload.verification
  native.status = 'FAILED'; assert.throws(() => verifiedEntryEvidence(r, j), /NATIVE_BROWSER_REQUIRED/)
  native.status = 'PASSED'; native.diagnostics.actions[0].status = 'FAILED'
  assert.throws(() => verifiedEntryEvidence(r, j), /ALL_NATIVE_ACTIONS_MUST_PASS/)
})
