import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { test } from 'node:test'
import { createPublisher } from '../../../services/runner/src/publish/publisher.mjs'
import { digest, readSnapshot } from '../../../services/runner/src/artifacts/snapshot.mjs'
import { openArtifactService } from '../../../services/runner/src/artifacts/service.mjs'
import { publicAddress, publicationSite } from '../../../services/runner/src/publish/policy.mjs'
import { createFrozenGateway, frozenPayload, deploymentDeadline } from '../../../services/runner/src/publish/frozen-gateway.mjs'

export const origins = { publicOrigin: 'https://sites.codeless-public.test', platformOrigin: 'https://app.codeless.test', previewOrigin: 'https://preview.codeless-preview.test' }
export async function boundaryFixture(root) {
  const artifactRoot = join(root, 'artifacts'), evidenceRoot = join(root, 'evidence'), hostingRoot = join(root, 'hosting')
  await Promise.all([artifactRoot, evidenceRoot, hostingRoot].map(path => mkdir(path, { recursive: true })))
  const id = randomUUID(), directory = join(artifactRoot, id)
  await mkdir(join(directory, 'assets'), { recursive: true })
  await writeFile(join(directory, 'index.html'), '<!doctype html><div id="app"><h1>Boundary fixture</h1></div><script type="module" src="/assets/page.js"></script>')
  await writeFile(join(directory, 'assets/page.js'), 'console.log("fixture")')
  await writeFile(join(directory, 'ai-component-catalog.json'), '{"sourceFile":"src/pages/HomePage.vue"}')
  await writeFile(join(directory, 'assets/page.js.map'), '{"sourcesContent":["private source"]}')
  const snapshot = await readSnapshot(directory)
  const sourceDigest = digest('explicit host-authored fixture'), artifact = { ...snapshot.manifest, directory }
  const build = { id, status: 'SUCCEEDED', exitCode: 0, failure: null, timedOut: false, oomKilled: false,
    completedAt: new Date().toISOString(), artifact, cleanup: { containerRemoved: true, workspaceRemoved: true, errors: [] } }
  const handle = await openArtifactService({ artifactRoot, build, sourceDigest })
  const verificationId = randomUUID(), reportDir = join(evidenceRoot, verificationId)
  await mkdir(reportDir)
  const png = Buffer.alloc(24); Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(png)
  png.writeUInt32BE(1280, 16); png.writeUInt32BE(720, 20)
  const verification = { id: verificationId, buildId: id, sourceDigest, artifactDigest: artifact.digest, status: 'PASSED',
    failure: null, workerExitCode: 0, timedOut: false, cleanup: { browserClosed: true },
    reportPath: join(reportDir, 'result.json'), screenshot: { path: join(reportDir, 'page.png'), digest: digest(png), bytes: png.length } }
  await writeFile(verification.reportPath, JSON.stringify(verification)); await writeFile(verification.screenshot.path, png)
  const version = { id: randomUUID(), applicationId: randomUUID(), status: 'VERIFIED', buildId: id, sourceDigest }
  return { artifactRoot, evidenceRoot, hostingRoot, build, handle, verification, version, fixture: true }
}

test('D15-B-01: frozen bytes, deployment isolation, source/catalog exclusion and same-ID retry binding', async () => {
  const root = await mkdtemp(join(tmpdir(), 'codeless-d15-publish-'))
  const fixture = await boundaryFixture(root)
  try {
    const publish = await createPublisher({ ...fixture, ...origins })
    const job = { ...fixture, deploymentId: randomUUID() }
    await writeFile(join(fixture.build.artifact.directory, 'assets/page.js'), 'disk mutation must not publish')
    const [first, retry] = await Promise.all([publish(job), publish(job)])
    assert.deepEqual(first, retry)
    assert.equal(await readFile(join(fixture.hostingRoot, job.deploymentId, 'assets/page.js'), 'utf8'), 'console.log("fixture")')
    const snapshot = await readSnapshot(join(fixture.hostingRoot, job.deploymentId))
    assert.deepEqual(snapshot.manifest.files.map(file => file.path), ['__deployment.json', 'assets/page.js', 'index.html'])
    await assert.rejects(publish({ ...job, version: { ...fixture.version, id: randomUUID() } }), /already bound/)
    const second = await publish({ ...job, deploymentId: randomUUID() })
    assert.notEqual(first.url, second.url)
    await assert.rejects(publish({ ...job, deploymentId: '../escape' }), /invalid/)
    await assert.rejects(publish({ ...job, handle: { ...fixture.handle } }), /live worker-owned/)
    for (const status of ['DRAFT', 'FAILED', 'FUTURE']) await assert.rejects(publish({ ...job, version: { ...fixture.version, status } }), /verified/)
    for (const patch of [{ workerExitCode: null }, { status: 'FAILED' }, { artifactDigest: digest('wrong') }, { cleanup: { browserClosed: false } }])
      await assert.rejects(publish({ ...job, verification: { ...fixture.verification, ...patch } }), /verified/)
    await writeFile(fixture.verification.screenshot.path, 'tampered')
    await assert.rejects(publish({ ...job, deploymentId: randomUUID() }), /evidence mismatch/)
    assert.equal(await readFile(join(fixture.hostingRoot, job.deploymentId, 'assets/page.js'), 'utf8'), 'console.log("fixture")')
  } finally {
    await fixture.handle.close()
    assert.equal(dirname(root), resolve(tmpdir())); await rm(root, { recursive: true, force: true })
  }
})

test('D15-B-02/03: dedicated sites and SSRF targets fail closed', () => {
  assert.throws(() => publicationSite('https://publish.codeless.test', origins.platformOrigin), /separate/)
  assert.throws(() => publicationSite(origins.previewOrigin, origins.platformOrigin, origins.previewOrigin), /separate/)
  assert.throws(() => publicationSite('http://sites.codeless-public.test', origins.platformOrigin), /HTTPS/)
  for (const address of ['127.0.0.1', '10.1.2.3', '172.31.1.2', '192.168.1.1', '169.254.169.254', '100.100.100.200', '::1', '::ffff:8.8.8.8', '198.18.0.1'])
    assert.equal(publicAddress(address), false, address)
  assert.equal(publicAddress('8.8.8.8'), true)
})

test('A frozen-byte gateway works after handle closure; tampering, ID conflicts and deadlines fail closed', async () => {
  const root = await mkdtemp(join(tmpdir(), 'codeless-d15-frozen-')), fixture = await boundaryFixture(root)
  const snapshot = await readSnapshot(fixture.build.artifact.directory)
  const payload = { publicationId: randomUUID(), versionId: fixture.version.id, artifactDigest: snapshot.manifest.digest,
    assets: snapshot.manifest.files.map(file => ({ path: file.path, digest: file.digest, bytes: snapshot.buffers.get(file.path).toString('base64') })) }
  await fixture.handle.close() // No live handle, report path, source directory or original Node process required.
  try {
    const gateway = await createFrozenGateway({ ...fixture, ...origins })
    const deadline = () => new Date(Date.now() + 30000).toISOString()
    const first = await gateway.publish(payload, deadline())
    assert.deepEqual(await gateway.publish(structuredClone(payload), deadline()), first)
    assert.equal(await readFile(join(fixture.hostingRoot, payload.publicationId, 'assets/page.js'), 'utf8'), 'console.log("fixture")')
    assert.deepEqual((await readSnapshot(join(fixture.hostingRoot, payload.publicationId))).manifest.files.map(file => file.path), ['__deployment.json', 'assets/page.js', 'index.html'])
    await assert.rejects(gateway.publish({ ...payload, versionId: randomUUID() }, deadline()), /already bound/)
    await assert.rejects(gateway.publish(payload, new Date(Date.now() - 1).toISOString()), /TIMEOUT/)
    await assert.rejects(gateway.probe(payload, 'https://127.0.0.1/', deadline()), /binding/)
    for (const patch of [{ bytes: Buffer.from('tampered').toString('base64') }, { path: '../escape' }, { bytes: '%%%=' }]) {
      const changed = structuredClone(payload); Object.assign(changed.assets[0], patch)
      assert.throws(() => frozenPayload(changed), /frozen/)
    }
    const duplicate = structuredClone(payload); duplicate.assets.push(duplicate.assets[0])
    assert.throws(() => frozenPayload(duplicate), /frozen/)
    assert.throws(() => frozenPayload({ ...payload, artifactDigest: digest('wrong') }), /manifest/)
    assert.throws(() => deploymentDeadline(new Date(Date.now() + 60000).toISOString()), /TIMEOUT/)
    await writeFile(join(fixture.hostingRoot, payload.publicationId, 'assets/page.js'), 'changed')
    await assert.rejects(gateway.probe(payload, first.url, deadline()), /stored publication/)
  } finally {
    assert.equal(dirname(root), resolve(tmpdir())); await rm(root, { recursive: true, force: true })
  }
})

test('a full 32MiB admitted artifact can be replayed with its separate private receipt; larger input fails', async () => {
  const root = await mkdtemp(join(tmpdir(), 'codeless-d15-quota-'))
  const hostingRoot = join(root, 'sites'); await mkdir(hostingRoot)
  try {
    const html = Buffer.from('<!doctype html><script src="/assets/page.js"></script>')
    const js = Buffer.alloc(32 * 1024 * 1024 - html.length, 32)
    const entries = [['assets/page.js', js], ['index.html', html]]
    const files = entries.map(([path, bytes]) => ({ path, bytes: bytes.length, digest: digest(bytes) }))
    const payload = { publicationId: randomUUID(), versionId: randomUUID(), artifactDigest: digest(JSON.stringify(files)),
      assets: entries.map(([path, bytes]) => ({ path, digest: digest(bytes), bytes: bytes.toString('base64') })) }
    const gateway = await createFrozenGateway({ hostingRoot, ...origins })
    const deadline = () => new Date(Date.now() + 30000).toISOString()
    const result = await gateway.publish(payload, deadline())
    assert.deepEqual(await gateway.publish(payload, deadline()), result)
    const tooLarge = { ...payload, assets: [...payload.assets, { path: 'assets/extra.css', digest: digest('x'), bytes: 'eA==' }] }
    assert.throws(() => frozenPayload(tooLarge), /frozen asset digest mismatch/)
  } finally {
    assert.equal(dirname(root), resolve(tmpdir())); await rm(root, { recursive: true, force: true })
  }
})
