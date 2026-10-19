import assert from 'node:assert/strict'

// Revalidate the original observation even when resuming an existing publication.
export function assertConcurrentEditCheckpoint(checkpoint) {
  assert.equal(checkpoint.publicationStatusWhenEditAccepted, 'REQUESTED',
    'Edit must be accepted while publication remains pending')
}
