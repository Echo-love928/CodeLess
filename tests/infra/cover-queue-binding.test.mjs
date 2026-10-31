import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm, realpath } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { createScreenshotQueue } from '../../services/runner/src/screenshot/queue.mjs'
import { createCoverAdapter } from '../../services/runner/src/screenshot/adapter.mjs'
import { digest } from '../../services/runner/src/artifacts/snapshot.mjs'
const id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', applicationId = '11111111-1111-4111-8111-111111111111', versionId = '55555555-5555-4555-8555-555555555555'
const origins = { publicOrigin: 'https://sites.codeless-public.test', platformOrigin: 'https://platform.codeless.test', previewOrigin: 'https://preview.codeless-preview.test' }
async function fixture(operation) {
  const parent = await realpath(tmpdir()), root = await mkdtemp(join(parent, 'codeless-cover-binding-'))
  const publication = { id, applicationId, versionId, status: 'PUBLISHED', sourceDigest: digest('source'), artifactDigest: digest('artifact'),
    url: `https://d${id.replaceAll('-', '')}.sites.codeless-public.test/`, entryPath: '/tasks' }
  const config = { ...origins, queueRoot: root, hostingRoot: root, lookupDeployment: async key => key === id ? publication : null }
  const resolveTarget = async () => ({ deploymentId: id, applicationId, versionId, sourceDigest: publication.sourceDigest,
    artifactDigest: publication.artifactDigest, entryPath: publication.entryPath })
  try { await operation(config, publication, resolveTarget) }
  finally { assert.equal(dirname(await realpath(root)), parent); await rm(root, { recursive: true }) }
}
test('a trusted admission failure is terminal, bound and durable, and is never silently retried', async () => {
  await fixture(async (config, publication, resolveTarget) => {
    let queue = await createScreenshotQueue(config, { resolveTarget })
    try {
      assert.equal(typeof queue.recordAdmissionFailure, 'function')
      const failed = await queue.recordAdmissionFailure(id, 'TARGET_REJECTED')
      assert.equal(failed.status, 'FAILED'); assert.equal(failed.attempts, 0); assert.equal(failed.entryPath, '/tasks')
      assert.deepEqual(await queue.enqueue(id), failed)
    } finally { await queue.close() }
    queue = await createScreenshotQueue(config, { resolveTarget })
    try {
      assert.equal(queue.get(id).status, 'FAILED'); assert.equal(queue.get(id).entryPath, '/tasks')
      assert.equal(await queue.runNext(), null)
      await assert.rejects(queue.recordAdmissionFailure('not-an-id', 'TARGET_REJECTED'))
    } finally { await queue.close() }
    assert.equal(publication.status, 'PUBLISHED')
  })
})
test('an entry change between admission and execution rejects without any capture call', async () => {
  await fixture(async (config, publication, resolveTarget) => {
    let captured = 0
    const queue = await createScreenshotQueue(config, { resolveTarget, capture: async () => {
      captured++; return { status: 'FAILED', failure: 'CAPTURE_FAILED', cleanupConfirmed: true }
    } })
    try {
      await queue.enqueue(id); publication.entryPath = '/catalog'
      const result = await queue.runNext()
      assert.equal(result.failureCode, 'TARGET_REJECTED'); assert.equal(captured, 0); assert.equal(result.entryPath, '/tasks')
    } finally { await queue.close() }
  })
})
test('owner reads cannot relabel an existing root cover as a tasks cover', async () => {
  await fixture(async (config, publication, resolveTarget) => {
    publication.entryPath = '/'; const queue = await createScreenshotQueue(config, { resolveTarget })
    try {
      await queue.enqueue(id); publication.entryPath = '/tasks'
      const adapter = createCoverAdapter({ queue, ownedPublication: async () => publication })
      await assert.rejects(adapter.record('owner', id), /NOT_FOUND/)
    } finally { await queue.close() }
  })
})
