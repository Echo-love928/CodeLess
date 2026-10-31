import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { validate } from '../../evals/edit-results/validate.mjs'
const original = JSON.parse(await readFile(new URL('../../evals/edit-results/D25-B/index.json', import.meta.url), 'utf8'))
test('missing runtime keeps six fixed requests unknown', () => {
  assert.deepEqual(validate(original), { denominator: 6, executed: 0, passed: 0, acceptance: null })
})
test('cannot omit a failed or unavailable sample', () => {
  const value = structuredClone(original); value.rows.splice(2, 1)
  assert.throws(() => validate(value))
})
test('cannot claim success without version and evidence', () => {
  const value = structuredClone(original); Object.assign(value.rows[0], { status: 'PASSED', passed: true })
  assert.throws(() => validate(value))
})
test('cannot mix candidate commits or turn unknown into zero', () => {
  const mixed = structuredClone(original); mixed.rows[0].candidate = '0'.repeat(40)
  assert.throws(() => validate(mixed))
  const zero = structuredClone(original); zero.rows[0].passed = 0
  assert.throws(() => validate(zero))
})

test('every row must match REAL mode, including otherwise complete successful MOCK edits', () => {
  // Synthetic counterexample only: never write these placeholder IDs into the REAL index.
  const complete = structuredClone(original)
  for (const row of complete.rows.filter(r => r.id.startsWith('EDIT-'))) Object.assign(row, {
    status: 'PASSED', passed: true, taskId: 'synthetic-task', versionId: 'synthetic-version',
    beforeVersionId: 'synthetic-before', screenshot: 'synthetic.png', evidence: 'synthetic.json',
    address: 'https://synthetic.example.test/', evidenceDigest: 'sha256:' + '0'.repeat(64),
    diff: 'synthetic.diff', scopePreserved: true, historyPreserved: true,
  })
  assert.equal(validate(complete).acceptance, true) // Structurally complete positive control.
  const allMock = structuredClone(complete)
  for (const row of allMock.rows.filter(r => r.id.startsWith('EDIT-'))) row.mode = 'MOCK'
  assert.throws(() => validate(allMock), /row mode must match index mode/)
  for (let i = 0; i < complete.rows.length; i++) {
    const mixed = structuredClone(complete); mixed.rows[i].mode = 'MOCK'
    assert.throws(() => validate(mixed), /row mode must match index mode/, complete.rows[i].id)
  }
})

test('unknown or absent row modes cannot enter a REAL index', () => {
  for (let i = 0; i < original.rows.length; i++) for (const mode of [undefined, null, 'UNKNOWN']) {
    const value = structuredClone(original); value.rows[i].mode = mode
    assert.throws(() => validate(value), /row mode must match index mode/, value.rows[i].id)
  }
})
