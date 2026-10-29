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
