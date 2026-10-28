import assert from 'node:assert/strict'
import { performance } from 'node:perf_hooks'

// SQL commits before the append-only deployment ledger. Observe convergence within
// one deadline; never convert UNKNOWN, a failed probe, or a missing ledger to success.
export async function awaitDeployment(read, id, observations, {
  timeoutMs = 30_000, now = () => performance.now(),
  sleep = ms => new Promise(resolve => setTimeout(resolve, ms)),
} = {}) {
  const start = now(), deadline = start + timeoutMs
  while (now() < deadline) {
    const value = await read(), elapsedMs = now() - start
    observations.push({ at: new Date().toISOString(), elapsedMs, publicationId: value.publication?.id,
      status: value.publication?.status, phase: value.phase, failureCode: value.failureCode,
      history: value.history })
    assert.equal(value.publication?.id, id, 'Deployment must belong to the requested publication')
    assert.ok(elapsedMs < timeoutMs, 'Deployment query exceeded the original deadline')
    if (value.phase === 'FAILED' || value.publication.status === 'FAILED') {
      throw new Error('Deployment failed: ' + (value.failureCode ?? 'UNKNOWN'))
    }
    if (value.phase === 'SUCCEEDED' && value.publication.status === 'PUBLISHED') {
      assert.equal(value.history?.at(-1)?.phase, 'SUCCEEDED', 'Success requires the terminal ledger entry')
      assert.equal(value.failureCode, null)
      return value
    }
    assert.ok(['PREPARING', 'PUBLISHING', 'PROBING', 'UNKNOWN'].includes(value.phase), 'Unexpected deployment phase')
    await sleep(Math.min(100, Math.max(0, deadline - now())))
  }
  throw new Error('Deployment did not converge before deadline; last phase=' + observations.at(-1)?.phase)
}
