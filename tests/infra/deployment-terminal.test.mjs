import assert from 'node:assert/strict'
import { test } from 'node:test'
import { awaitDeployment } from '../e2e/full/deployment-terminal.mjs'

const value = (phase, status = 'PUBLISHED') => ({ publication: { id: 'publication-1', status }, phase,
  failureCode: null, history: [{ phase: phase === 'UNKNOWN' ? 'PROBING' : phase }] })
function clock() {
  let at = 0
  return { timeoutMs: 300, now: () => at, sleep: async ms => { at += ms } }
}

test('committed SQL with delayed terminal ledger must be observed before success', async () => {
  const observations = [], sequence = [value('UNKNOWN'), value('UNKNOWN'), value('SUCCEEDED')]
  const result = await awaitDeployment(async () => sequence.shift(), 'publication-1', observations, clock())
  assert.equal(result.phase, 'SUCCEEDED')
  assert.deepEqual(observations.map(x => x.phase), ['UNKNOWN', 'UNKNOWN', 'SUCCEEDED'])
})

test('permanent UNKNOWN exhausts one deadline and remains failure', async () => {
  const observations = []
  await assert.rejects(awaitDeployment(async () => value('UNKNOWN'), 'publication-1', observations, clock()), /did not converge.*UNKNOWN/)
  assert.equal(observations.length, 3)
  assert.ok(observations.every(x => x.phase === 'UNKNOWN'))
})

test('a failed probe stops immediately even if a later read could succeed', async () => {
  let queries = 0
  await assert.rejects(awaitDeployment(async () => {
    queries++; return { ...value('FAILED', 'FAILED'), failureCode: 'DEPLOYMENT_PROBE_FAILED' }
  }, 'publication-1', [], clock()), /DEPLOYMENT_PROBE_FAILED/)
  assert.equal(queries, 1)
})

test('a terminal volume entry without SQL commit cannot be accepted', async () => {
  await assert.rejects(awaitDeployment(async () => value('SUCCEEDED', 'REQUESTED'), 'publication-1', [], clock()), /Unexpected deployment phase/)
})

test('missing terminal history, mismatched identity and HTTP errors never retry to success', async () => {
  for (const response of [{ ...value('SUCCEEDED'), history: [] },
    { ...value('SUCCEEDED'), publication: { id: 'other', status: 'PUBLISHED' } }]) {
    await assert.rejects(awaitDeployment(async () => response, 'publication-1', [], clock()))
  }
  let queries = 0
  const error = new Error('HTTP 503')
  await assert.rejects(awaitDeployment(async () => { queries++; throw error }, 'publication-1', [], clock()), e => e === error)
  assert.equal(queries, 1)
})
