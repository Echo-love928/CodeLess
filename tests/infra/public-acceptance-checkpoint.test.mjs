import test from 'node:test'
import assert from 'node:assert/strict'
import { assertConcurrentEditCheckpoint } from '../../infra/public/acceptance-checkpoint.mjs'

const resumed = observed => JSON.parse(JSON.stringify({
  publication: { id: 'existing-publication', status: 'PUBLISHED' },
  editTask: { id: 'existing-edit', status: 'READY' },
  publicationStatusWhenEditAccepted: observed,
}))

test('resumed successful publication retains its original pending-at-edit evidence', () => {
  assert.doesNotThrow(() => assertConcurrentEditCheckpoint(resumed('REQUESTED')))
})

test('resuming cannot erase a failed or missing pending-at-edit observation', () => {
  for (const observed of ['PUBLISHED', 'FAILED', null, undefined]) {
    assert.throws(() => assertConcurrentEditCheckpoint(resumed(observed)), {
      code: 'ERR_ASSERTION',
      message: /Edit must be accepted while publication remains pending/,
    })
  }
})
