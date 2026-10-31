import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, realpath, rm, readdir, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { validateCoverRequest, runCoverGateway } from '../../services/runner/src/screenshot/gateway.mjs'
import { digest } from '../../services/runner/src/artifacts/snapshot.mjs'
const id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const origins = { publicOrigin: 'https://sites.codeless-public.test', platformOrigin: 'https://platform.codeless.test', previewOrigin: 'https://preview.codeless-preview.test' }
const request = () => ({ action: 'capture', deadline: new Date(Date.now() + 44000).toISOString(), binding: { id,
  applicationId: '11111111-1111-4111-8111-111111111111', versionId: '55555555-5555-4555-8555-555555555555', status: 'PUBLISHED',
  sourceDigest: digest('source'), artifactDigest: digest('artifact'), url: `https://d${id.replaceAll('-', '')}.sites.codeless-public.test/`, entryPath: '/tasks' } })
test('installed cover protocol is closed and cannot select commands, hosts, resolvers or a longer deadline', () => {
  assert.ok(validateCoverRequest(request()) > 0)
  for (const field of ['command', 'shell', 'host', 'queueRoot', 'resolveDns']) assert.throws(() => validateCoverRequest({ ...request(), [field]: 'untrusted' }))
  for (const field of ['path', 'sourceFile', 'provider']) { const r = request(); r.binding[field] = 'untrusted'; assert.throws(() => validateCoverRequest(r)) }
  for (const ms of [-1, 1000, 60000]) assert.throws(() => validateCoverRequest({ ...request(), deadline: new Date(Date.now() + ms).toISOString() }))
})
test('an interrupted native worker is retained for manual recovery, without a startup rewrite', async () => {
  const parent = await realpath(tmpdir()), root = await mkdtemp(join(parent, 'codeless-cover-gateway-'))
  try {
    const config = { ...origins, queueRoot: root, hostingRoot: root }
    await runCoverGateway(config, request())
    const file = join(root, id, 'job.json'), original = JSON.parse(await readFile(file, 'utf8'))
    for (const status of ['RUNNING', 'RETRYING']) {
      const text = JSON.stringify({ ...original, status, attempts: 1 })
      await writeFile(file, text)
      await assert.rejects(runCoverGateway(config, request()), /COVER_PENDING_RECOVERY/)
      assert.equal(await readFile(file, 'utf8'), text)
    }
  } finally { assert.equal(dirname(await realpath(root)), parent); await rm(root, { recursive: true }) }
})
test('an unsafe binding fails before directory writes or DNS and cannot invent a cover', async () => {
  const parent = await realpath(tmpdir()), root = await mkdtemp(join(parent, 'codeless-cover-gateway-'))
  try {
    let dns = 0; const r = request(); r.binding.url = 'http://127.0.0.1/'
    await assert.rejects(runCoverGateway({ ...origins, queueRoot: root, hostingRoot: root }, r,
      { resolveDns: async () => { dns++; return [] } }), /TARGET_REJECTED/)
    assert.equal(dns, 0); assert.deepEqual(await readdir(root), [])
  } finally { assert.equal(dirname(await realpath(root)), parent); await rm(root, { recursive: true }) }
})
test('a committed target whose admission fails remains terminal across invocations without reset', async () => {
  const parent = await realpath(tmpdir()), root = await mkdtemp(join(parent, 'codeless-cover-gateway-'))
  try {
    // No receipt exists: real immutable-file validation rejects before browser/network.
    const config = { ...origins, queueRoot: root, hostingRoot: root }, r = request()
    const first = await runCoverGateway(config, r)
    assert.equal(first.record.status, 'FAILED'); assert.equal(first.record.attempts, 0); assert.equal(first.record.entryPath, '/tasks')
    const second = await runCoverGateway(config, request()); assert.deepEqual(second, first)
    const changed = request(); changed.binding.versionId = '66666666-6666-4666-8666-666666666666'
    await assert.rejects(runCoverGateway(config, changed), /COVER_BINDING_REJECTED/)
  } finally { assert.equal(dirname(await realpath(root)), parent); await rm(root, { recursive: true }) }
})
