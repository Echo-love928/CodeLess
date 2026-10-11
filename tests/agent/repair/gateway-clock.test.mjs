import assert from 'node:assert/strict'
import { test } from 'node:test'
import { randomUUID } from 'node:crypto'
import { request } from 'node:http'
import { writeFile } from 'node:fs/promises'
import { createPreviewGateway } from '../../../services/runner/src/preview/gateway.mjs'
import { KEY_HEX, signed } from '../../e2e/preview/fixtures.mjs'

test('real gateway distinguishes a future-issued fixture from a valid unmapped application using one clock', async () => {
  let clock = 1_700_000_000_900
  const app = randomUUID(), version = randomUUID()
  const handle = { buildId: randomUUID(), sourceDigest: 'sha256:' + '1'.repeat(64), artifactDigest: 'sha256:' + '2'.repeat(64) }
  const gateway = createPreviewGateway({ signingKeyHex: KEY_HEX,
    previewOrigin: 'https://preview.codeless-preview.test', platformOrigin: 'https://platform.codeless.test', now: () => clock })
  await new Promise(done => gateway.server.listen(0, '127.0.0.1', done))
  const host = 'v' + version.replaceAll('-', '') + '.preview.codeless-preview.test'
  const get = token => new Promise((done, reject) => {
    const req = request({ hostname: '127.0.0.1', port: gateway.server.address().port,
      path: '/__preview/start?credential=' + token, headers: { Host: host } }, response => {
      response.resume(); response.on('end', () => done(response.statusCode))
    })
    req.on('error', reject); req.setTimeout(3000, () => req.destroy(new Error('Local gateway timeout'))); req.end()
  })
  try {
    const future = await get(signed(handle, app, version, clock + 1000))
    const validToken = signed(handle, app, version, clock)
    const unmapped = await get(validToken)
    clock += 120_000
    const expired = await get(validToken)
    assert.equal(future, 403); assert.equal(unmapped, 404); assert.equal(expired, 403)
    if (process.env.CODELESS_GATEWAY_CLOCK_EVIDENCE) await writeFile(process.env.CODELESS_GATEWAY_CLOCK_EVIDENCE,
      JSON.stringify({ future, unmapped, expired, gatewayReal: true, signingKey: 'EXPLICIT_TEST_FIXTURE',
        artifactMapping: 'NONE', paidCalls: 0, modelQualityEvidence: false,
        conclusion: 'FROZEN_VALIDATION_CLOCK_AND_WALL_SIGNING_CLOCK_SELECT_DIFFERENT_REJECTION_PATHS' }, null, 2) + '\n', { flag: 'wx' })
  } finally { await gateway.close() }
})
