import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { request } from 'node:http'
import { mkdtemp, mkdir, readFile, rm, symlink, link, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { after, before, test } from 'node:test'
import { openArtifactService, browserTarget } from '../../../services/runner/src/artifacts/service.mjs'
import { readSnapshot } from '../../../services/runner/src/artifacts/snapshot.mjs'
import { validateActions, limits } from '../../../services/runner/src/verify/actions.mjs'
import { completedFixture } from './fixtures.mjs'

let scratch, artifactRoot
before(async () => {
  scratch = await mkdtemp(join(tmpdir(), 'codeless-d08-static-'))
  artifactRoot = join(scratch, 'artifacts')
  await mkdir(artifactRoot)
})
after(async () => {
  assert.equal(dirname(scratch), resolve(tmpdir()))
  await rm(scratch, { recursive: true, force: true })
})
function get(origin, path = '/', headers = {}, method = 'GET') {
  return new Promise((done, reject) => {
    const req = request(origin, { path, headers, method }, (response) => {
      let body = ''
      response.on('data', (chunk) => { body += chunk })
      response.on('end', () => done({ status: response.statusCode, headers: response.headers, body }))
    })
    req.on('error', reject)
    req.end()
  })
}
test('only confirmed completed builds are accepted; unknowns and failures stay rejected', async () => {
  const fixture = await completedFixture(artifactRoot)
  for (const override of [{ status: 'RUNNING' }, { exitCode: null }, { exitCode: 1 }, { failure: 'TIMEOUT' },
    { timedOut: true }, { oomKilled: true }, { completedAt: null }, { artifact: null },
    { cleanup: { containerRemoved: false, workspaceRemoved: true, errors: [] } },
    { cleanup: { containerRemoved: true, workspaceRemoved: true, errors: ['unknown'] } }]) {
    await assert.rejects(openArtifactService({ artifactRoot, sourceDigest: fixture.sourceDigest,
      build: { ...fixture.build, ...override } }), /confirmed completed/)
  }
  await assert.rejects(openArtifactService({ artifactRoot, build: fixture.build, sourceDigest: 'unknown' }))
})
test('artifact path, full manifest and digest are verified before service listens', async () => {
  const fixture = await completedFixture(artifactRoot)
  await assert.rejects(openArtifactService({ artifactRoot, ...fixture,
    build: { ...fixture.build, artifact: { ...fixture.build.artifact, directory: scratch } } }), /outside worker root/)
  await writeFile(join(fixture.build.artifact.directory, 'page.js'), 'changed')
  await assert.rejects(openArtifactService({ artifactRoot, ...fixture }), /hash mismatch/)
})
test('private loopback service rejects unauthenticated, traversal, method, foreign host and proxy targets', async () => {
  const fixture = await completedFixture(artifactRoot)
  const service = await openArtifactService({ artifactRoot, ...fixture })
  try {
    const target = browserTarget(service)
    const headers = { 'x-codeless-artifact-token': target.token }
    assert.equal((await get(service.origin)).status, 403)
    const allowed = await get(service.origin, '/', headers)
    assert.equal(allowed.status, 200)
    assert.match(allowed.headers['content-security-policy'], /worker-src 'none'/)
    for (const path of ['/%2e%2e/secret', '/%2findex.html', '/page.js%3aother', '/secret', '/.env', 'http://169.254.169.254/']) {
      assert.notEqual((await get(service.origin, path, headers)).status, 200)
    }
    assert.equal((await get(service.origin, '/', headers, 'POST')).status, 403)
    assert.equal((await get(service.origin, '/', { ...headers, Host: 'metadata.google.internal' })).status, 403)
    const refused = await new Promise((done, reject) => {
      const req = request(service.origin, { method: 'CONNECT', path: '169.254.169.254:80', headers })
      req.on('connect', (response, socket) => { socket.destroy(); done(response.statusCode) })
      req.on('error', reject); req.end()
    })
    assert.equal(refused, 403)
    await writeFile(join(fixture.build.artifact.directory, 'index.html'), 'mutated after registration')
    assert.equal((await get(service.origin, '/', headers)).body, allowed.body)
    assert.throws(() => browserTarget({ origin: service.origin }), /worker-owned/)
  } finally { await service.close() }
})
test('symbolic directories, hardlinks and artifact byte limits fail closed', async () => {
  const fixture = await completedFixture(artifactRoot)
  const directory = fixture.build.artifact.directory
  await link(join(directory, 'page.js'), join(directory, 'linked.js'))
  await assert.rejects(readSnapshot(directory), /type or size/)
  const other = await completedFixture(artifactRoot)
  await symlink(scratch, join(other.build.artifact.directory, 'escape'), process.platform === 'win32' ? 'junction' : 'dir')
  await assert.rejects(readSnapshot(other.build.artifact.directory), /links/)
  const bounded = await completedFixture(artifactRoot)
  await assert.rejects(readSnapshot(bounded.build.artifact.directory, { bytes: 1 }), /size/)
  assert.equal((await readFile(join(bounded.build.artifact.directory, 'page.js'))).length, 0)
})
test('controlled action grammar rejects scripts, arbitrary selectors, URLs and relaxed limits', () => {
  for (const action of [
    { type: 'evaluate', script: 'fetch("http://169.254.169.254")' },
    { type: 'click', target: { selector: 'body' } },
    { type: 'click', target: { role: 'button', name: 'Save' }, script: 'evil()' },
    { type: 'navigate', path: 'http://127.0.0.1/admin' },
    { type: 'navigate', path: '//169.254.169.254' },
    { type: 'navigate', path: '/../secret' },
    { type: 'navigate', path: '/%2e%2e/secret' },
    { type: 'fill', target: { testId: 'name' }, value: 'x'.repeat(2001) }
  ]) assert.throws(() => validateActions([action]))
  assert.throws(() => validateActions(Array(21).fill({ type: 'reload' })))
  for (const value of [{ runTimeoutMs: 30001 }, { shell: 1 }, { screenshotTimeoutMs: 0 }]) assert.throws(() => limits(value))
  const actions = [{ type: 'fill', target: { testId: 'name' }, value: '' }, { type: 'reload' },
    { type: 'navigate', path: '/#details' }, { type: 'check', target: { role: 'checkbox', name: 'Done' } }]
  const copy = validateActions(actions)
  actions[0].target.testId = 'changed'
  assert.equal(copy[0].target.testId, 'name')
  assert.equal(limits({ screenshotTimeoutMs: 1 }).screenshotTimeoutMs, 1)
})
