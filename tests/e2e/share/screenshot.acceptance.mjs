import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import { createScreenshotQueue } from '../../../services/runner/src/screenshot/queue.mjs'
import { createTargetResolver } from '../../../services/runner/src/screenshot/target.mjs'
import { captureDeployment } from '../../../services/runner/src/screenshot/capture.mjs'
import { capturePage } from '../../../services/runner/src/screenshot/worker.mjs'
import { createAssetReader } from '../../../services/runner/src/screenshot/network.mjs'
import { createCoverAdapter } from '../../../services/runner/src/screenshot/adapter.mjs'
import { createPublicationStore } from '../../../services/runner/src/publish/store.mjs'
import { digest } from '../../../services/runner/src/artifacts/snapshot.mjs'

const evidence = resolve(process.env.CODELESS_SHARE_EVIDENCE_DIR ?? '.local-data/d16-b/screenshot')
await mkdir(evidence, { recursive: true })
const id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', app = '11111111-1111-4111-8111-111111111111', version = '55555555-5555-4555-8555-555555555555'
const sourceDigest = digest('explicit screenshot fixture'), artifactDigest = digest('frozen full artifact fixture')
const url = `https://d${id.replaceAll('-', '')}.sites.codeless-public.test/`
const publication = { id, applicationId: app, versionId: version, status: 'PUBLISHED', sourceDigest, artifactDigest, url }
const html = Buffer.from('<!doctype html><html><head><title>Screenshot fixture</title></head><body><div id="app"><h1>Deployment cover · v1</h1></div><script src="/assets/app.js"></script></body></html>')
const js = Buffer.from('document.querySelector("h1").style.color = "rgb(31, 79, 180)"')
const buffers = new Map([['assets/app.js', js], ['index.html', html]])
const files = [...buffers].map(([path, bytes]) => ({ path, bytes: bytes.length, digest: digest(bytes) }))
const receipt = { deploymentId: id, versionId: version, artifactDigest, publishedDigest: digest(JSON.stringify(files)), files, url }
const target = { deploymentId: id, applicationId: app, versionId: version, sourceDigest, artifactDigest, url, address: '8.8.8.8', files }
const origins = { publicOrigin: 'https://sites.codeless-public.test', platformOrigin: 'https://app.codeless.test', previewOrigin: 'https://preview.codeless-preview.test' }

async function fixture() {
  const root = await mkdtemp(join(evidence, 'queue-')), hostingRoot = join(root, 'sites'), queueRoot = join(root, 'covers')
  await mkdir(hostingRoot); await mkdir(queueRoot)
  const store = await createPublicationStore(hostingRoot); await store(receipt, buffers)
  // Exercise the production default deadline. Short timeout behavior is isolated
  // explicitly in T2; a success-path fixture must not impose a different budget.
  const config = { ...origins, queueRoot, hostingRoot, lookupDeployment: async () => structuredClone(publication) }
  return { root, config, resolveTarget: createTargetResolver(config, async () => [{ address: '8.8.8.8', family: 4 }]) }
}
// Explicit deterministic HTTPS transport fixture. Production TLS/DNS is NOT mocked into public success.
function transport(bodyPatch, status = 200) {
  return (options, callback) => {
    assert.equal(options.protocol, 'https:'); assert.equal(options.hostname, new URL(url).hostname)
    assert.equal(options.servername, options.hostname); assert.equal(options.agent, false)
    assert.equal(options.headers.Cookie, undefined); assert.equal(options.rejectUnauthorized, undefined)
    options.lookup(options.hostname, { all: true }, (error, records) => { assert.equal(error, null); assert.deepEqual(records, [{ address: '8.8.8.8', family: 4 }]) })
    const req = new EventEmitter()
    req.destroy = error => { req.emit('error', error); req.emit('close') }
    req.end = () => queueMicrotask(() => {
      const response = new PassThrough(); response.statusCode = status; response.headers = {}
      callback(response); response.end(bodyPatch ?? buffers.get(options.path.slice(1)))
      response.once('end', () => req.emit('close'))
    })
    return req
  }
}

test('T1: deployment resolver + durable queue + real Chromium PNG bind the exact published version', { timeout: 30000 }, async () => {
  const f = await fixture()
  const queue = await createScreenshotQueue(f.config, { resolveTarget: f.resolveTarget, capture: async value => {
    const result = await capturePage({ ...value, deadline: Date.now() + 12000 }, transport())
    assert.equal(result.status, 'SUCCEEDED', JSON.stringify(result))
    return { status: result.status, failure: result.failure, cleanupConfirmed: result.browserClosed, png: Buffer.from(result.screenshot, 'base64') }
  } })
  try {
    const queued = await Promise.all([queue.enqueue(id), queue.enqueue(id)])
    assert.equal(queued[0].status, 'QUEUED'); assert.deepEqual(queued[0], queued[1])
    const jobs = await Promise.all([queue.runNext(), queue.runNext()])
    assert.equal(jobs[0].status, 'SUCCEEDED'); assert.deepEqual(jobs[0], jobs[1]); assert.equal(jobs[0].attempts, 1)
    assert.equal(jobs[0].versionId, version); assert.equal(jobs[0].deploymentId, id)
    const adapter = createCoverAdapter({ queue, ownedPublication: async owner => owner === 'owner' ? publication : null })
    const image = await adapter.image('owner', id, jobs[0].imageDigest)
    await assert.rejects(adapter.image('other', id, jobs[0].imageDigest), /NOT_FOUND/)
    await assert.rejects(adapter.image('owner', id, digest('wrong')), /NOT_FOUND/)
    await writeFile(join(evidence, 'T1-cover.png'), image)
    await writeFile(join(evidence, 'T1-result.json'), JSON.stringify({ ...jobs[0], transport: 'EXPLICIT_HTTPS_FIXTURE', chromium: 'REAL', publicationUnchanged: publication.status === 'PUBLISHED' }, null, 2))
  } finally { await queue.close() }
  const restored = await createScreenshotQueue(f.config, { resolveTarget: f.resolveTarget })
  assert.equal(restored.get(id).status, 'SUCCEEDED'); assert.ok((await restored.image(id)).length > 24)
  await restored.close(); await rm(f.root, { recursive: true, force: true })
})

test('T2: capture timeout retries finitely, persists FAILED, and never mutates PUBLISHED', async () => {
  const f = await fixture(), before = JSON.stringify(publication)
  let attempts = 0
  // This test isolates the capture timer. Disk/DNS admission is independently
  // covered by T1/T3 and must not consume its intentionally tiny capture budget.
  const queue = await createScreenshotQueue({ ...f.config, timeoutMs: 50 }, { resolveTarget: async () => target, capture: async (_target, { signal }) => {
    attempts++
    await new Promise(done => signal.addEventListener('abort', done, { once: true }))
    return { status: 'FAILED', failure: 'CAPTURE_TIMEOUT', cleanupConfirmed: true }
  } })
  try {
    await queue.enqueue(id)
    const result = await queue.runNext()
    assert.equal(result.status, 'FAILED'); assert.equal(result.failureCode, 'CAPTURE_TIMEOUT'); assert.equal(attempts, 2)
    assert.equal(JSON.stringify(publication), before); assert.equal((await queue.enqueue(id)).attempts, 2)
    assert.equal(await queue.runNext(), null)
    await assert.rejects(queue.image(id), /COVER_UNAVAILABLE/)
    await writeFile(join(evidence, 'T2-result.json'), JSON.stringify({ result, publicationUnchanged: true, actualAbortTimer: true }, null, 2))
  } finally { await queue.close(); await rm(f.root, { recursive: true, force: true }) }
})

test('T3: rejects URLs/objects, uncommitted deployments, wrong versions and all nonpublic DNS answers before capture', async () => {
  const f = await fixture()
  try {
    for (const input of ['http://127.0.0.1/', 'http://169.254.169.254/latest/meta-data/', { deploymentId: id, url: 'https://external.test/' }, '../' + id])
      await assert.rejects(f.resolveTarget(input), /TARGET_REJECTED/)
    for (const address of ['127.0.0.1', '10.0.0.1', '172.16.0.1', '192.168.1.1', '169.254.169.254', '100.100.100.200', '::1', '::ffff:8.8.8.8', 'fe80::1']) {
      const resolveTarget = createTargetResolver(f.config, async () => [{ address: '8.8.8.8', family: 4 }, { address, family: 4 }])
      await assert.rejects(resolveTarget(id), /TARGET_REJECTED/)
    }
    for (const patch of [{ status: 'REQUESTED' }, { url: 'http://169.254.169.254/' }, { versionId: app }, { artifactDigest: digest('wrong') }]) {
      const resolveTarget = createTargetResolver({ ...f.config, lookupDeployment: async () => ({ ...publication, ...patch }) }, async () => [{ address: '8.8.8.8' }])
      await assert.rejects(resolveTarget(id), /TARGET_REJECTED/)
    }
    await writeFile(join(f.config.hostingRoot, id, 'assets/app.js'), 'tampered')
    await assert.rejects(f.resolveTarget(id), /TARGET_REJECTED/)
  } finally { await rm(f.root, { recursive: true, force: true }) }
})

test('T3: pinned asset reader rejects redirects, unknown paths, tampering and private worker addresses', async () => {
  const job = { ...target, deadline: Date.now() + 10000 }
  assert.throws(() => createAssetReader({ ...job, address: '169.254.169.254' }), /TARGET_REJECTED/)
  const reader = createAssetReader(job, transport())
  assert.deepEqual(await reader('/index.html'), html)
  await assert.rejects(reader('/.env'), /TARGET_REJECTED/)
  await assert.rejects(createAssetReader(job, transport(Buffer.from('changed')))('/index.html'), /PUBLIC_CONTENT_MISMATCH/)
  await assert.rejects(createAssetReader(job, transport(undefined, 302))('/index.html'), /PUBLIC_CONTENT_MISMATCH/)
})

test('real Chromium cannot make private/metadata/page-selected requests through the capture network boundary', { timeout: 30000 }, async () => {
  const malicious = Buffer.from('fetch("http://169.254.169.254/latest/meta-data/"); fetch("http://127.0.0.1/private"); new WebSocket("ws://10.0.0.1/");')
  const manifest = files.map(file => file.path.endsWith('.js') ? { ...file, bytes: malicious.length, digest: digest(malicious) } : file)
  let requested = 0
  const request = (options, callback) => { requested++; return transport(options.path.endsWith('.js') ? malicious : undefined)(options, callback) }
  const result = await capturePage({ ...target, files: manifest, deadline: Date.now() + 10000 }, request)
  assert.equal(result.status, 'FAILED'); assert.equal(result.browserClosed, true); assert.equal(requested, 2)
})

test('real stdio worker is forcibly bounded and its process tree is reclaimed', { timeout: 10000 }, async () => {
  const result = await captureDeployment(target, { timeoutMs: 150 })
  assert.equal(result.status, 'FAILED'); assert.equal(result.failure, 'CAPTURE_TIMEOUT'); assert.equal(result.cleanupConfirmed, true)
})

test('unknown cleanup stops retries; queue ownership and read-time image digest are fail-closed', async () => {
  const f = await fixture(); let attempts = 0
  const queue = await createScreenshotQueue(f.config, { resolveTarget: f.resolveTarget, capture: async () => { attempts++; return { status: 'FAILED', failure: 'CAPTURE_FAILED', cleanupConfirmed: false } } })
  try {
    await assert.rejects(createScreenshotQueue(f.config), /EEXIST/)
    await queue.enqueue(id); const result = await queue.runNext()
    assert.equal(result.status, 'FAILED'); assert.equal(result.failureCode, 'CLEANUP_FAILED'); assert.equal(attempts, 1)
  } finally { await queue.close(); await rm(f.root, { recursive: true, force: true }) }
})
