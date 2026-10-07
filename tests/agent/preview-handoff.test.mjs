import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createHash, createHmac, randomBytes } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { readFile, mkdir, writeFile } from 'node:fs/promises'
import { request } from 'node:http'
import { dirname, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

// Explicit review command, outside default discovery. Missing real evidence/peer code fails.
// This tests the trusted A→B handoff; it does not claim a deployed or real-model preview.
const hash = bytes => 'sha256:' + createHash('sha256').update(bytes).digest('hex')
const json = async path => JSON.parse(await readFile(path, 'utf8'))
function get(origin, host, path, cookie) {
  return new Promise((done, reject) => {
    const req = request(origin, { path, headers: { Host: host, ...(cookie ? { Cookie: cookie } : {}) } }, response => {
      const chunks = []
      response.on('data', chunk => chunks.push(chunk))
      response.on('end', () => done({ status: response.statusCode, headers: response.headers, bytes: Buffer.concat(chunks) }))
      response.on('error', reject)
    })
    req.on('error', reject); req.end()
  })
}

test('verified A multi-file build reopens as a live B mapping with the exact immutable bindings', async () => {
  assert.ok(process.env.CODELESS_D09_B_REVIEW_ROOT, 'exact reviewed D09-B checkout required')
  const peer = resolve(process.env.CODELESS_D09_B_REVIEW_ROOT)
  const peerHead = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: peer, encoding: 'utf8', windowsHide: true }).trim()
  const evidenceRoot = resolve(process.env.CODELESS_AGENT_EVIDENCE_DIR || '.local-data/d09-a/evidence')
  const evidence = await json(join(evidenceRoot, 'D09-A-T1.json'))
  assert.equal(evidence.fixture, false)
  assert.equal(evidence.modelProvider, 'deterministic-mock')
  assert.equal(evidence.task.status, 'READY')
  assert.equal(evidence.draft.files.length, 2)
  const result = evidence.runner
  assert.equal(result.status, 'VERIFIED')
  const artifactRoot = dirname(result.build.artifact.directory)
  assert.deepEqual(await json(join(dirname(artifactRoot), 'receipts', result.executionId + '.json')), result)
  assert.deepEqual(await json(result.verification.reportPath), result.verification)
  assert.equal(hash(await readFile(result.verification.screenshot.path)), result.verification.screenshot.digest)
  const load = relative => import(pathToFileURL(join(peer, relative)).href)
  const { readSnapshot } = await load('services/runner/src/artifacts/snapshot.mjs')
  const source = await readSnapshot(evidence.draft.sourceDirectory, { source: true, files: 40, bytes: 524288, fileBytes: 131072 })
  assert.equal(source.manifest.digest, evidence.draft.sourceDigest)
  assert.deepEqual(source.manifest.files, evidence.draft.files)
  const { openArtifactService } = await load('services/runner/src/artifacts/service.mjs')
  const { createPreviewGateway } = await load('services/runner/src/preview/gateway.mjs')
  // A's verification process has closed its handle. B's trusted coordinator must reopen it.
  const handle = await openArtifactService({ artifactRoot, build: result.build, sourceDigest: result.sourceDigest })
  const app = evidence.task.applicationId, version = evidence.draft.versionId
  const host = 'v' + version.replaceAll('-', '') + '.preview.codeless-preview.test'
  const key = randomBytes(32) // Isolated test key, never persisted or sent to generated code.
  let now = Date.now()
  const gateway = createPreviewGateway({ signingKeyHex: key.toString('hex'),
    previewOrigin: 'https://preview.codeless-preview.test', platformOrigin: 'https://platform.codeless.test', now: () => now })
  await new Promise((done, reject) => { gateway.server.once('error', reject); gateway.server.listen(0, '127.0.0.1', done) })
  try {
    gateway.register({ applicationId: app, versionId: version, handle, verification: result.verification })
    const issued = Math.floor(now / 1000)
    const body = Buffer.from(['v1', app, version, handle.buildId, handle.sourceDigest, handle.artifactDigest,
      issued, issued + 120, randomBytes(16).toString('hex')].join('.')).toString('base64url')
    const token = body + '.' + createHmac('sha256', key).update(body).digest('base64url')
    const origin = 'http://127.0.0.1:' + gateway.server.address().port
    const start = await get(origin, host, '/__preview/start?credential=' + token)
    assert.equal(start.status, 303)
    const cookie = start.headers['set-cookie'][0].split(';')[0]
    const html = await get(origin, host, '/', cookie)
    assert.equal(html.status, 200)
    assert.equal(html.headers['cache-control'], 'no-store')
    assert.match(html.bytes.toString(), /codeless-preview/)
    for (const file of result.build.artifact.files.filter(file => file.path !== 'index.html')) {
      const asset = await get(origin, host, '/' + file.path, cookie)
      assert.equal(asset.status, 200)
      assert.equal(hash(asset.bytes), file.digest)
    }
    assert.equal((await get(origin, 'v' + '0'.repeat(32) + '.preview.codeless-preview.test', '/', cookie)).status, 403)
    now += 120000
    assert.equal((await get(origin, host, '/', cookie)).status, 403)
    const output = resolve(process.env.CODELESS_AGENT_PEER_EVIDENCE_DIR || '.local-data/d09-a/peer-handoff-evidence')
    await mkdir(output, { recursive: true })
    await writeFile(join(output, 'preview-handoff.json'), JSON.stringify({ status: 'PASSED', peerHead,
      modelProvider: evidence.modelProvider, modelUsage: null, sourceFileCount: 2, buildFixture: false, browserFixture: false,
      credentialIssuerFixture: true, transport: 'private loopback HTTP; peer browser test separately verifies TLS/iframe',
      platformEndToEnd: false, applicationId: app, versionId: version, buildId: handle.buildId,
      verificationId: result.verification.id, sourceDigest: handle.sourceDigest, artifactDigest: handle.artifactDigest,
      screenshotDigest: result.verification.screenshot.digest, exactAssetBytes: true, expiredRejected: true, wrongVersionHostRejected: true }, null, 2) + '\n')
  } finally { await gateway.close(); await handle.close() }
})
