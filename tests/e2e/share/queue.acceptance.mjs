import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { hostname } from 'node:os'
import { randomUUID } from 'node:crypto'
import { spawn } from 'node:child_process'
import { createScreenshotQueue } from '../../../services/runner/src/screenshot/queue.mjs'
import { recoverQueueOwner } from '../../../services/runner/src/screenshot/owner.mjs'
import { digest } from '../../../services/runner/src/artifacts/snapshot.mjs'

const evidence = resolve(process.env.CODELESS_SHARE_EVIDENCE_DIR ?? '.local-data/d16-b/queue')
await mkdir(evidence, { recursive: true })
const png = await readFile(new URL('./evidence/2026-10-19/T1-cover.png', import.meta.url))
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const target = deploymentId => ({ deploymentId, applicationId: id(999), versionId: id(998), sourceDigest: digest('source'), artifactDigest: digest('artifact') })
const dependencies = { resolveTarget: async deploymentId => target(deploymentId), capture: async () => ({ status: 'SUCCEEDED', failure: null, cleanupConfirmed: true, png }) }
async function fixture(status, count = 100) {
  const root = await mkdtemp(join(evidence, 'retention-'))
  for (let n = 1; n <= count; n++) {
    const directory = join(root, id(n)); await mkdir(directory)
    const succeeded = status === 'SUCCEEDED'
    await writeFile(join(directory, 'job.json'), JSON.stringify({ ...target(id(n)), status, attempts: status === 'QUEUED' ? 0 : 1,
      failureCode: null, imageDigest: succeeded ? digest(png) : null, imageBytes: succeeded ? png.length : null, completedAt: succeeded ? n : null }))
    if (succeeded) await writeFile(join(directory, 'cover.png'), png)
  }
  return root
}

test('the 101st and later deployments rotate oldest terminal covers and still capture; reads serialize with retention', async () => {
  const root = await fixture('SUCCEEDED')
  const queue = await createScreenshotQueue({ queueRoot: root }, { ...dependencies, resolveTarget: async deploymentId => {
    if (deploymentId === id(500)) throw new Error('TARGET_REJECTED')
    return target(deploymentId)
  } })
  try {
    await assert.rejects(queue.enqueue(id(500)), /TARGET_REJECTED/)
    assert.equal(queue.get(id(1)).status, 'SUCCEEDED') // Invalid admission must not discard a cover.
    await queue.enqueue(id(101))
    assert.equal(queue.get(id(1)), null)
    await assert.rejects(readFile(join(root, id(1), 'job.json')), { code: 'ENOENT' })
    assert.equal((await queue.runNext()).status, 'SUCCEEDED')
    assert.deepEqual(await queue.image(id(101)), png)
    const [oldImage] = await Promise.all([queue.image(id(2)), queue.enqueue(id(102))])
    assert.deepEqual(oldImage, png); assert.equal(queue.get(id(2)), null)
    assert.equal((await readdir(root)).filter(name => name !== 'owner.lock').length, 100)
  } finally { await queue.close() }
  const reopened = await createScreenshotQueue({ queueRoot: root }, dependencies)
  try {
    assert.equal(reopened.get(id(101)).status, 'SUCCEEDED')
    assert.equal(reopened.get(id(102)).status, 'QUEUED')
    assert.deepEqual(await reopened.image(id(101)), png)
  } finally { await reopened.close(); await rm(root, { recursive: true, force: true }) }
})

test('capacity never deletes pending jobs to admit another deployment', async () => {
  const root = await fixture('QUEUED'), queue = await createScreenshotQueue({ queueRoot: root }, dependencies)
  try {
    await assert.rejects(queue.enqueue(id(101)), /QUEUE_FULL/)
    for (let n = 1; n <= 100; n++) assert.equal(queue.get(id(n)).status, 'QUEUED')
    assert.equal((await readdir(root)).filter(name => name !== 'owner.lock').length, 100)
  } finally { await queue.close(); await rm(root, { recursive: true, force: true }) }
})

test('offline recovery refuses a live owner, missing maintenance acknowledgement, foreign host and invalid lock', async () => {
  const root = await fixture('QUEUED', 0), queue = await createScreenshotQueue({ queueRoot: root }, dependencies)
  const path = join(root, 'owner.lock'), original = await readFile(path)
  try {
    await assert.rejects(recoverQueueOwner(root), /QUEUE_MAINTENANCE_REQUIRED/)
    await assert.rejects(recoverQueueOwner(root, { workersStopped: true }), /QUEUE_OWNER_ALIVE/)
    await assert.rejects(createScreenshotQueue({ queueRoot: root }, dependencies), /EEXIST/)
    assert.deepEqual(await readFile(path), original)
    for (const owner of [{ pid: process.pid, id: randomUUID(), host: hostname() + '-other' }, { pid: -1, id: randomUUID() }, { pid: process.pid, id: '../invalid' }]) {
      await writeFile(path, JSON.stringify(owner))
      await assert.rejects(recoverQueueOwner(root, { workersStopped: true }), /QUEUE_OWNER_INVALID/)
      assert.deepEqual(JSON.parse(await readFile(path)), owner)
    }
  } finally { await writeFile(path, original); await queue.close(); await rm(root, { recursive: true, force: true }) }
})

test('offline command reclaims a provably exited owner; interrupted jobs fail closed on reopen', async () => {
  const child = spawn(process.execPath, ['-e', 'process.exit(0)'], { windowsHide: true })
  await new Promise((done, reject) => { child.once('error', reject); child.once('close', code => code === 0 ? done() : reject(new Error('fixture child failed'))) })
  const root = await fixture('RUNNING', 1)
  try {
    await writeFile(join(root, 'owner.lock'), JSON.stringify({ pid: child.pid, id: randomUUID(), host: hostname() }))
    const cli = spawn(process.execPath, ['services/runner/src/screenshot/recover-lock.mjs', root, '--workers-stopped'],
      { windowsHide: true, env: { ...process.env, FORCE_COLOR: '1', NO_COLOR: '1' } })
    let output = '', diagnostics = ''
    cli.stdout.on('data', bytes => { output += bytes }); cli.stderr.on('data', bytes => { diagnostics += bytes })
    await new Promise((done, reject) => { cli.once('error', reject); cli.once('close', code => code === 0 ? done() : reject(new Error(output + diagnostics))) })
    assert.equal(JSON.parse(output).status, 'RECOVERED')
    const queue = await createScreenshotQueue({ queueRoot: root }, dependencies)
    try {
      assert.equal(queue.get(id(1)).status, 'FAILED'); assert.equal(queue.get(id(1)).failureCode, 'CAPTURE_INTERRUPTED')
      assert.equal(await queue.runNext(), null)
    } finally { await queue.close() }
  } finally { await rm(root, { recursive: true, force: true }) }
})
