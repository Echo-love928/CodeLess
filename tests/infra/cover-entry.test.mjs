import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, rm, realpath } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import { createTargetResolver } from '../../services/runner/src/screenshot/target.mjs'
import { createAssetReader } from '../../services/runner/src/screenshot/network.mjs'
import { capturePage } from '../../services/runner/src/screenshot/worker.mjs'
import { digest } from '../../services/runner/src/artifacts/snapshot.mjs'

const id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', applicationId = '11111111-1111-4111-8111-111111111111'
const versionId = '55555555-5555-4555-8555-555555555555', url = `https://d${id.replaceAll('-', '')}.sites.codeless-public.test/`
const html = Buffer.from('<!doctype html><html><body><h1>Verified tasks cover</h1><script src="/assets/app.js"></script></body></html>')
const js = Buffer.from('document.querySelector("h1").style.color="blue"')
const files = [['index.html', html], ['assets/app.js', js]].map(([path, b]) => ({ path, bytes: b.length, digest: digest(b) }))
const target = { deploymentId: id, applicationId, versionId, sourceDigest: digest('source'), artifactDigest: digest('artifact'),
  url, files, address: '8.8.8.8', entryPath: '/tasks' }
const origins = { publicOrigin: 'https://sites.codeless-public.test', platformOrigin: 'https://platform.codeless.test', previewOrigin: 'https://preview.codeless-preview.test' }

async function fixture(operation) {
  const parent = await realpath(tmpdir()), root = await mkdtemp(join(parent, 'codeless-cover-entry-'))
  try {
    const directory = join(root, id); await mkdir(directory); await mkdir(join(directory, 'assets'))
    await writeFile(join(directory, 'index.html'), html); await writeFile(join(directory, 'assets/app.js'), js)
    await writeFile(join(directory, '__deployment.json'), JSON.stringify({ deploymentId: id, versionId, artifactDigest: target.artifactDigest,
      url, files, publishedDigest: digest(JSON.stringify(files)) }))
    const projection = { id, applicationId, versionId, status: 'PUBLISHED', sourceDigest: target.sourceDigest,
      artifactDigest: target.artifactDigest, url, entryPath: '/tasks' }
    await operation({ ...origins, hostingRoot: root, lookupDeployment: async () => structuredClone(projection) }, projection)
  } finally {
    assert.equal(dirname(await realpath(root)), parent); await rm(root, { recursive: true })
  }
}
// Explicit fixture transport; only Chromium/asset validation are real here, not public deployment.
function mockHttps(paths) {
  return (options, callback) => {
    assert.equal(options.rejectUnauthorized, undefined); assert.equal(options.servername, new URL(url).hostname)
    assert.equal(options.headers.Cookie, undefined); paths.push(options.path)
    const request = new EventEmitter(); request.destroy = e => request.emit('error', e)
    request.end = () => queueMicrotask(() => { const response = new PassThrough(); response.statusCode = 200; response.headers = {}
      callback(response); response.end(options.path === '/tasks' ? html : options.path === '/assets/app.js' ? js : Buffer.from('wrong route'))
      response.once('end', () => request.emit('close')) })
    return request
  }
}
test('trusted target resolves the actual functional entry; unsafe and ambiguous caller paths fail closed', async () => {
  await fixture(async (config, projection) => {
    const resolver = createTargetResolver(config, async () => [{ address: '8.8.8.8', family: 4 }])
    assert.equal((await resolver(id)).entryPath, '/tasks')
    for (const path of ['http://127.0.0.1/', '//169.254.169.254/', '/tasks?next=1', '/catalog/../tasks', '/tasks#x']) {
      projection.entryPath = path; await assert.rejects(resolver(id), /TARGET_REJECTED/)
    }
  })
})
test('a non-root SPA index is read from its exact public route and digest checked without TLS/cookie changes', async () => {
  const paths = [], read = createAssetReader({ ...target, deadline: Date.now() + 10000 }, mockHttps(paths))
  assert.deepEqual(await read('/index.html'), html); assert.deepEqual(paths, ['/tasks'])
  for (const entryPath of ['https://evil.test/', '/tasks?x=1', '/admin'])
    assert.throws(() => createAssetReader({ ...target, entryPath, deadline: Date.now() + 10000 }, mockHttps([])), /TARGET_REJECTED/)
})
test('real Chromium captures a non-root functional page through the unchanged network boundary', { timeout: 20000 }, async () => {
  const paths = [], result = await capturePage({ ...target, deadline: Date.now() + 12000 }, mockHttps(paths))
  assert.equal(result.status, 'SUCCEEDED'); assert.equal(result.browserClosed, true)
  assert.deepEqual(paths.sort(), ['/tasks', '/assets/app.js'].sort())
  const png = Buffer.from(result.screenshot, 'base64'); assert.equal(png.readUInt32BE(16), 1280); assert.equal(png.readUInt32BE(20), 720)
})
