import test from 'node:test'
import assert from 'node:assert/strict'
import { join } from 'node:path'
import { isRealRunLocation, REAL_RUNS, REAL_RESULT_RUNS, root } from '../../../scripts/eval/lib.mjs'
import { runBatch } from '../../../scripts/eval/run-batch.mjs'

test('D25 REAL evidence roots have segment boundaries and reject traversal', () => {
  for (const directory of [REAL_RUNS, REAL_RESULT_RUNS]) {
    assert.equal(isRealRunLocation(join(root, directory)), true)
    assert.equal(isRealRunLocation(join(root, directory, 'batch')), true)
    assert.equal(isRealRunLocation(join(root, directory + '-mock', 'batch')), false)
    assert.equal(isRealRunLocation(join(root, directory, '..', 'mock')), false)
  }
  assert.equal(isRealRunLocation(join(root, '.local-data/mock')), false)
})

test('D25 MOCK driver rejects both reserved REAL roots before creating output', async () => {
  for (const directory of [REAL_RUNS, REAL_RESULT_RUNS]) {
    await assert.rejects(runBatch({ mode: 'MOCK', out: join(root, directory), isolated: false }, {
      gitState: () => ({ head: 'test', branch: 'test', scopedClean: true }),
    }), /mock batches never go under/)
  }
})
