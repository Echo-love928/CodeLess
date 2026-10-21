import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createServer } from 'node:http'
import { mkdtemp, mkdir, rm } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { completedFixture } from '../../runner/browser/fixtures.mjs'
import { openArtifactService } from '../../../services/runner/src/artifacts/service.mjs'
import { createBrowserVerifier } from '../../../services/runner/src/verify/verifier.mjs'
import { capturePage } from '../../../services/runner/src/screenshot/worker.mjs'
import { target, transport } from './network.test.mjs'
import { evidence } from './evidence.mjs'

async function verify(js, limits) {
  const root = await mkdtemp(join(tmpdir(), 'codeless-d19-browser-'))
  let handle
  try {
    const artifactRoot = join(root, 'artifacts'); await mkdir(artifactRoot)
    const built = await completedFixture(artifactRoot, { js })
    handle = await openArtifactService({ artifactRoot, ...built })
    return await (await createBrowserVerifier({ evidenceRoot: join(root, 'reports'), limits }))(handle)
  } finally {
    if (handle) await handle.close()
    assert.equal(dirname(root), resolve(tmpdir())); await rm(root, { recursive: true, force: true })
  }
}
test('D19 T1: browser navigation and fetch to a live private canary never reach it', { timeout: 30000 }, async () => {
  let hits = 0
  const canary = createServer((_req, res) => { hits++; res.end('sensitive platform fixture') })
  await new Promise(done => canary.listen(0, '127.0.0.1', done))
  const privateUrl = 'http://127.0.0.1:' + canary.address().port + '/admin'
  try {
    const fetch = await verify(`fetch(${JSON.stringify(privateUrl)}).catch(()=>{});fetch('http://169.254.169.254/latest/meta-data/').catch(()=>{});new WebSocket('ws://10.0.0.1/');`)
    assert.equal(fetch.status, 'FAILED'); assert.equal(fetch.failure, 'NETWORK_BLOCKED', JSON.stringify(fetch))
    assert.equal(fetch.cleanup.browserClosed, true)
    const redirect = await verify(`location.replace(${JSON.stringify(privateUrl)})`)
    assert.equal(redirect.status, 'FAILED'); assert.ok(redirect.diagnostics.blockedRequests.length)
    assert.equal(redirect.cleanup.browserClosed, true); assert.equal(hits, 0)
    await evidence('T1-browser-private-canary', { fetch, redirect, hits })
  } finally { await new Promise(done => { canary.close(done); canary.closeAllConnections() }) }
})
test('D19 T2: CPU-exhausting browser script hits its deadline and cannot pass verification', { timeout: 20000 }, async () => {
  const result = await verify('while(true){}', { runTimeoutMs: 6000, navigationTimeoutMs: 1500 })
  assert.equal(result.status, 'FAILED'); assert.match(result.failure, /TIMEOUT/)
  assert.ok(result.cleanup.browserClosed || result.cleanup.processTreeTerminated === true, JSON.stringify(result))
  await evidence('T2-browser-cpu', result)
})
test('D19 T4: real screenshot browser rejects private navigation, WebSocket and busy-loop fixtures', { timeout: 30000 }, async () => {
  const results = []
  for (const js of ["location.replace('http://169.254.169.254/latest/meta-data/')", "new WebSocket('ws://10.0.0.1/')", 'while(true){}']) {
    const { job, buffers } = target(js), visited = []
    const result = await capturePage({ ...job, deadline: Date.now() + 5000 }, transport(buffers, { visited }))
    assert.equal(result.status, 'FAILED', js); assert.equal(result.browserClosed, true); assert.equal(result.screenshot, null)
    assert.ok(visited.length <= 2); results.push({ js, result, visited })
  }
  await evidence('T4-screenshot-adversarial', { transport: 'EXPLICIT_HTTPS_DOUBLE', browser: 'REAL_CHROMIUM', results })
})
