import assert from 'node:assert/strict'
import { test } from 'node:test'
import { randomUUID } from 'node:crypto'
import { request } from 'node:http'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, dirname, resolve } from 'node:path'
import { openArtifactService } from '../../../services/runner/src/artifacts/service.mjs'
import { createPreviewGateway } from '../../../services/runner/src/preview/gateway.mjs'
import { readCredential, signingKey } from '../../../services/runner/src/preview/credentials.mjs'
import { completedFixture } from '../../runner/browser/fixtures.mjs'
import { KEY_HEX, signed, passedFixture } from './fixtures.mjs'

function get(origin, host, path = '/', cookie, headers = {}, method = 'GET') {
  return new Promise((done, reject) => {
    const req = request(origin, { path, method, headers: { Host: host, ...(cookie ? { Cookie: cookie } : {}), ...headers } }, response => {
      let body = ''; response.on('data', chunk => { body += chunk }); response.on('end', () => done({ status: response.statusCode, headers: response.headers, body }))
    }); req.on('error', reject); req.end()
  })
}
async function fixture(run) {
  const scratch = await mkdtemp(join(tmpdir(), 'codeless-d09-gateway-'))
  const artifactRoot = join(scratch, 'artifacts'); await mkdir(artifactRoot)
  const built = await completedFixture(artifactRoot)
  const handle = await openArtifactService({ artifactRoot, ...built })
  const app = randomUUID(), version = randomUUID()
  let clock = Date.now()
  const gateway = createPreviewGateway({ signingKeyHex: KEY_HEX, previewOrigin: 'https://preview.codeless-preview.test',
    platformOrigin: 'https://platform.codeless.test', now: () => clock })
  await new Promise(done => gateway.server.listen(0, '127.0.0.1', done))
  const origin = 'http://127.0.0.1:' + gateway.server.address().port
  const host = 'v' + version.replaceAll('-', '') + '.preview.codeless-preview.test'
  const token = signed(handle, app, version, clock), cookie = '__Host-codeless-preview=' + token
  gateway.register({ applicationId: app, versionId: version, handle, verification: passedFixture(handle) })
  try { await run({ gateway, handle, app, version, token, cookie, host, origin, built, advance: ms => { clock += ms } }) }
  finally { await gateway.close(); await handle.close(); assert.equal(dirname(scratch), resolve(tmpdir())); await rm(scratch, { recursive: true, force: true }) }
}

test('D09-B-T1/T4: bootstrap scopes a secure preview cookie; documents/resources are immutable and no-store', async () => {
  await fixture(async ({ origin, host, token, cookie, built }) => {
    const start = await get(origin, host, '/__preview/start?credential=' + token)
    assert.equal(start.status, 303); assert.equal(start.headers.location, '/')
    const setCookie = start.headers['set-cookie'][0]
    for (const flag of ['Secure', 'HttpOnly', 'SameSite=None', 'Partitioned', 'Path=/']) assert.ok(setCookie.includes(flag))
    assert.ok(!setCookie.includes('Domain='))
    const root = await get(origin, host, '/', cookie)
    assert.equal(root.status, 200); assert.match(root.body, /Fixture/); assert.match(root.body, /codeless-preview/)
    assert.equal(root.headers['cache-control'], 'no-store')
    assert.match(root.headers['content-security-policy'], /frame-ancestors https:\/\/platform.codeless.test/)
    assert.match(root.headers['content-security-policy'], /sandbox allow-scripts allow-same-origin/)
    assert.equal((await get(origin, host, '/page.js', cookie)).status, 200)
    assert.equal((await get(origin, host, '/tasks', cookie, { 'Sec-Fetch-Dest': 'iframe' })).body, root.body)
    assert.equal((await get(origin, host, '/tasks', cookie, { 'Sec-Fetch-Dest': 'empty' })).status, 404)
    await writeFile(join(built.build.artifact.directory, 'index.html'), 'stale disk replacement')
    assert.equal((await get(origin, host, '/', cookie)).body, root.body)
  })
})
test('D09-B-T2: missing/expired/forged credentials and altered version/host/path/method are rejected', async () => {
  await fixture(async ({ origin, host, token, cookie, handle, app, advance }) => {
    assert.equal((await get(origin, host)).status, 403)
    assert.equal((await get(origin, host, '/', 'JSESSIONID=platform-session')).status, 403)
    assert.equal((await get(origin, host, '/', cookie, {}, 'POST')).status, 403)
    assert.equal((await get(origin, host, '/__preview/start?credential=' + token.slice(0, -1) + '!')).status, 403)
    const wire = token.split('.')
    const altered = Buffer.from(wire[0], 'base64url').toString('utf8').split('.')
    altered[2] = randomUUID() // Valid wire encoding and UUID, with the original signature.
    const forgedVersion = Buffer.from(altered.join('.')).toString('base64url') + '.' + wire[1]
    assert.equal((await get(origin, host, '/__preview/start?credential=' + forgedVersion)).status, 403)
    assert.equal((await get(origin, 'v' + randomUUID().replaceAll('-', '') + '.preview.codeless-preview.test', '/', cookie)).status, 403)
    assert.equal((await get(origin, host, '/', '__Host-codeless-preview=' + signed(handle, randomUUID(), randomUUID()))).status, 403)
    for (const path of ['/%2e%2e/.env', '/..//secret', '/%2fpage.js', '/.env', '/unknown', 'http://169.254.169.254/']) {
      assert.notEqual((await get(origin, host, path, cookie)).status, 200)
    }
    assert.equal((await get(origin, 'platform.codeless.test', '/', cookie, { 'X-Forwarded-Host': host })).status, 403)
    const wrongApp = signed(handle, randomUUID(), readCredential(token, signingKey(KEY_HEX)).version)
    assert.equal((await get(origin, host, '/__preview/start?credential=' + wrongApp)).status, 404)
    advance(120_000)
    assert.equal((await get(origin, host, '/', cookie)).status, 403)
    assert.equal((await get(origin, host, '/page.js', cookie)).status, 403)
    assert.equal((await get(origin, host, '/__preview/start?credential=' + token)).status, 403)
    assert.ok(app)
  })
})
test('registration trusts only live worker handles and matching successful browser evidence; versions cannot be replaced', async () => {
  await fixture(async ({ gateway, handle, app, version, origin, host, cookie }) => {
    assert.throws(() => gateway.register({ applicationId: app, versionId: randomUUID(), handle: { ...handle }, verification: passedFixture(handle) }), /worker-owned/)
    for (const diff of [{ status: 'FAILED' }, { workerExitCode: null }, { timedOut: true }, { screenshot: null },
      { buildId: randomUUID() }, { artifactDigest: 'wrong' }, { completedAt: null }, { cleanup: { browserClosed: false } }]) {
      assert.throws(() => gateway.register({ applicationId: app, versionId: randomUUID(), handle, verification: { ...passedFixture(handle), ...diff } }), /verification/)
    }
    assert.throws(() => gateway.register({ applicationId: app, versionId: version, handle, verification: passedFixture(handle) }), /immutable/)
    gateway.revoke(app, version)
    assert.equal((await get(origin, host, '/', cookie)).status, 404)
  })
})
test('configuration rejects same-site or insecure previews and unsupported public suffixes', () => {
  for (const preview of ['http://preview.codeless-preview.test', 'https://preview.codeless.test',
    'https://preview.example.co.uk', 'https://preview.codeless-preview.test/path']) {
    assert.throws(() => createPreviewGateway({ signingKeyHex: KEY_HEX, previewOrigin: preview, platformOrigin: 'https://platform.codeless.test' }))
  }
  assert.throws(() => signingKey('known-short-secret'))
})
