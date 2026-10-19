import { mkdir, writeFile, rename, readdir, unlink } from 'node:fs/promises'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { canonical } from '../preview/registry.mjs'
import { uuid } from '../preview/credentials.mjs'
import { readSnapshot, digest, isDigest } from '../artifacts/snapshot.mjs'
import { createTargetResolver } from './target.mjs'
import { captureDeployment } from './capture.mjs'

const terminal = new Set(['SUCCEEDED', 'FAILED'])
const pngValid = png => Buffer.isBuffer(png) && png.length >= 24 && png.length <= 6 * 1024 * 1024 &&
  png.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) && png.readUInt32BE(16) === 1280 && png.readUInt32BE(20) === 720
function timed(operation, signal) {
  signal.throwIfAborted()
  return new Promise((done, reject) => {
    const abort = () => reject(new Error('CAPTURE_TIMEOUT'))
    signal.addEventListener('abort', abort, { once: true })
    Promise.resolve().then(operation).then(done, reject).finally(() => signal.removeEventListener('abort', abort))
  })
}

// Private, single coordinator queue. A lifetime lock prevents two processes owning this root.
// Deployment SQL and publication state are deliberately absent from this writer.
export async function createScreenshotQueue(config, dependencies = {}) {
  const root = await canonical(config.queueRoot)
  const timeoutMs = config.timeoutMs ?? 12000, maxAttempts = config.maxAttempts ?? 2
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 10 || timeoutMs > 15000 || !Number.isSafeInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 2)
    throw new Error('queue limits rejected')
  const resolveTarget = dependencies.resolveTarget ?? createTargetResolver(config)
  const capture = dependencies.capture ?? captureDeployment
  const lock = join(root, 'owner.lock')
  await writeFile(lock, JSON.stringify({ pid: process.pid, id: randomUUID() }), { flag: 'wx', mode: 0o600 })
  const jobs = new Map()
  let active = null, closed = false, writing = Promise.resolve()
  async function save(job) {
    const directory = join(root, job.deploymentId)
    await canonical(directory)
    const staging = join(directory, randomUUID() + '.tmp')
    await writeFile(staging, JSON.stringify(job), { flag: 'wx', mode: 0o600 })
    await rename(staging, join(directory, 'job.json'))
  }
  function view(job) {
    if (!job) return null
    const { deploymentId, applicationId, versionId, sourceDigest, artifactDigest, status, attempts, failureCode, imageDigest, imageBytes } = job
    return { deploymentId, applicationId, versionId, sourceDigest, artifactDigest, status, attempts, failureCode, imageDigest, imageBytes }
  }
  try {
    for (const name of await readdir(root)) {
      if (name === 'owner.lock') continue
      if (!uuid.test(name) || jobs.size >= 100) throw new Error('QUEUE_STORAGE_INVALID')
      const directory = join(root, name); await canonical(directory)
      const snapshot = await readSnapshot(directory, { files: 5, bytes: 7 * 1024 * 1024 })
      const job = JSON.parse(snapshot.buffers.get('job.json')?.toString() ?? 'null')
      if (!job || job.deploymentId !== name || !['QUEUED', 'RUNNING', 'RETRYING', 'SUCCEEDED', 'FAILED'].includes(job.status) ||
          !uuid.test(job.applicationId ?? '') || !uuid.test(job.versionId ?? '') || !isDigest(job.sourceDigest) || !isDigest(job.artifactDigest) ||
          !Number.isSafeInteger(job.attempts) || job.attempts < 0 || job.attempts > maxAttempts) throw new Error('QUEUE_STORAGE_INVALID')
      if (job.status === 'SUCCEEDED') {
        const png = snapshot.buffers.get('cover.png')
        if (!pngValid(png) || digest(png) !== job.imageDigest || png.length !== job.imageBytes) throw new Error('QUEUE_STORAGE_INVALID')
      } else if (job.status !== 'QUEUED' && !terminal.has(job.status)) {
        job.status = 'FAILED'; job.failureCode = 'CAPTURE_INTERRUPTED'; await save(job)
      }
      jobs.set(name, job)
    }
  } catch (error) { await unlink(lock); throw error }
  async function enqueue(deploymentId) {
    if (closed || typeof deploymentId !== 'string' || !uuid.test(deploymentId)) throw new Error('TARGET_REJECTED')
    if (jobs.has(deploymentId)) return view(jobs.get(deploymentId))
    if (jobs.size >= 100) throw new Error('QUEUE_FULL')
    // Resolve again at execution time; enqueuing does not prove capture or publication success.
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), timeoutMs)
    let target
    try { target = await timed(() => resolveTarget(deploymentId, controller.signal), controller.signal) }
    finally { clearTimeout(timer) }
    const job = { deploymentId, applicationId: target.applicationId, versionId: target.versionId,
      sourceDigest: target.sourceDigest, artifactDigest: target.artifactDigest, status: 'QUEUED', attempts: 0,
      failureCode: null, imageDigest: null, imageBytes: null }
    await mkdir(join(root, deploymentId), { mode: 0o700 }); await save(job); jobs.set(deploymentId, job)
    return view(job)
  }
  async function run() {
    const job = [...jobs.values()].find(value => value.status === 'QUEUED')
    if (!job) return null
    while (job.attempts < maxAttempts) {
      job.status = 'RUNNING'; job.attempts++; job.failureCode = null; await save(job)
      const controller = new AbortController(), timer = setTimeout(() => controller.abort(), timeoutMs)
      let retry = true
      try {
        const target = await timed(() => resolveTarget(job.deploymentId, controller.signal), controller.signal)
        if (['applicationId', 'versionId', 'sourceDigest', 'artifactDigest'].some(key => job[key] !== target[key])) throw new Error('TARGET_REJECTED')
        const result = await capture(target, { signal: controller.signal, timeoutMs })
        retry = result?.cleanupConfirmed === true
        if (controller.signal.aborted || result?.status !== 'SUCCEEDED' || result.failure !== null || !retry)
          throw new Error(!retry ? 'CLEANUP_FAILED' : controller.signal.aborted ? 'CAPTURE_TIMEOUT' : result?.failure ?? 'CAPTURE_FAILED')
        if (!pngValid(result.png)) throw new Error('CAPTURE_FAILED')
        await writeFile(join(root, job.deploymentId, 'cover.png'), result.png, { flag: 'wx', mode: 0o600 })
        job.imageDigest = digest(result.png); job.imageBytes = result.png.length; job.status = 'SUCCEEDED'; job.failureCode = null
        await save(job); break
      } catch (error) {
        job.imageDigest = null; job.imageBytes = null
        job.failureCode = ['TARGET_REJECTED', 'CAPTURE_TIMEOUT', 'CAPTURE_FAILED', 'CLEANUP_FAILED'].includes(error.message) ? error.message : 'CAPTURE_FAILED'
        if (job.failureCode === 'TARGET_REJECTED' || !retry || job.attempts >= maxAttempts) { job.status = 'FAILED'; await save(job); break }
        job.status = 'RETRYING'; await save(job)
      } finally { clearTimeout(timer) }
    }
    return view(job)
  }
  return {
    // Serialize admission, including duplicate calls awaiting the same filesystem entry.
    enqueue(id) { const promise = writing.then(() => enqueue(id)); writing = promise.catch(() => {}); return promise },
    get(id) { return view(jobs.get(id)) },
    async image(id) {
      const job = jobs.get(id)
      if (job?.status !== 'SUCCEEDED') throw new Error('COVER_UNAVAILABLE')
      await canonical(join(root, id))
      const snapshot = await readSnapshot(join(root, id), { files: 5, bytes: 7 * 1024 * 1024 })
      const png = snapshot.buffers.get('cover.png')
      if (!pngValid(png) || digest(png) !== job.imageDigest || png.length !== job.imageBytes) throw new Error('COVER_UNAVAILABLE')
      return png
    },
    runNext() { if (closed) throw new Error('QUEUE_CLOSED'); if (!active) active = writing.then(run).finally(() => { active = null }); return active },
    async close() { closed = true; await writing; if (active) await active; await unlink(lock) },
  }
}
