import { mkdir, writeFile, rename, readdir, stat, rm } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { randomUUID } from 'node:crypto'
import { canonical } from '../preview/registry.mjs'
import { uuid } from '../preview/credentials.mjs'
import { readSnapshot, digest, isDigest } from '../artifacts/snapshot.mjs'
import { createTargetResolver, validatePublishedBinding } from './target.mjs'
import { captureDeployment } from './capture.mjs'
import { acquireQueueOwner } from './owner.mjs'

const terminal = new Set(['SUCCEEDED', 'FAILED'])
const entry = value => {
  const path = value.entryPath === undefined ? '/' : value.entryPath
  if (!['/', '/tasks', '/catalog'].includes(path)) throw new Error('TARGET_REJECTED')
  return path
}
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
  const releaseOwner = await acquireQueueOwner(root)
  const jobs = new Map()
  let active = null, activeId = null, closed = false, writing = Promise.resolve()
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
    return { deploymentId, applicationId, versionId, sourceDigest, artifactDigest, entryPath: entry(job), status, attempts, failureCode, imageDigest, imageBytes }
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
          !Number.isSafeInteger(job.attempts) || job.attempts < 0 || job.attempts > maxAttempts ||
          (job.completedAt != null && (!Number.isSafeInteger(job.completedAt) || job.completedAt < 0))) throw new Error('QUEUE_STORAGE_INVALID')
      entry(job)
      if (job.status === 'SUCCEEDED') {
        const png = snapshot.buffers.get('cover.png')
        if (!pngValid(png) || digest(png) !== job.imageDigest || png.length !== job.imageBytes) throw new Error('QUEUE_STORAGE_INVALID')
      } else if (job.status !== 'QUEUED' && !terminal.has(job.status)) {
        job.status = 'FAILED'; job.failureCode = 'CAPTURE_INTERRUPTED'; job.completedAt = Date.now(); await save(job)
      }
      if (terminal.has(job.status) && job.completedAt == null) job.completedAt = Math.floor((await stat(join(directory, 'job.json'))).mtimeMs)
      jobs.set(name, job)
    }
  } catch (error) { await releaseOwner(); throw error }
  async function makeRoom() {
    if (jobs.size < 100) return
    const oldest = [...jobs.values()].filter(job => terminal.has(job.status) && job.deploymentId !== activeId)
      .sort((a, b) => a.completedAt - b.completedAt || a.deploymentId.localeCompare(b.deploymentId))[0]
    if (!oldest) throw new Error('QUEUE_FULL')
    const directory = await canonical(join(root, oldest.deploymentId))
    // Check the resolved absolute child and all members before recursive removal.
    if (dirname(directory) !== root) throw new Error('QUEUE_STORAGE_INVALID')
    await readSnapshot(directory, { files: 5, bytes: 7 * 1024 * 1024 })
    await rm(directory, { recursive: true })
    jobs.delete(oldest.deploymentId)
  }
  async function enqueue(deploymentId) {
    if (closed || typeof deploymentId !== 'string' || !uuid.test(deploymentId)) throw new Error('TARGET_REJECTED')
    if (jobs.has(deploymentId)) return view(jobs.get(deploymentId))
    // Resolve again at execution time; enqueuing does not prove capture or publication success.
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), timeoutMs)
    let target
    try { target = await timed(() => resolveTarget(deploymentId, controller.signal), controller.signal) }
    finally { clearTimeout(timer) }
    await makeRoom()
    const job = { deploymentId, applicationId: target.applicationId, versionId: target.versionId, entryPath: entry(target),
      sourceDigest: target.sourceDigest, artifactDigest: target.artifactDigest, status: 'QUEUED', attempts: 0,
      failureCode: null, imageDigest: null, imageBytes: null, completedAt: null }
    await mkdir(join(root, deploymentId), { mode: 0o700 }); await save(job); jobs.set(deploymentId, job)
    return view(job)
  }
  // Private coordinator only: persist a proven pre-capture failure under the same
  // quota/owner lock. No image, attempt or successful capture is invented.
  async function admissionFailure(deploymentId, failureCode) {
    if (closed || typeof deploymentId !== 'string' || !uuid.test(deploymentId) ||
        !['TARGET_REJECTED', 'CAPTURE_TIMEOUT', 'CAPTURE_FAILED'].includes(failureCode)) throw new Error('TARGET_REJECTED')
    if (jobs.has(deploymentId)) return view(jobs.get(deploymentId))
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), timeoutMs)
    let binding
    try { binding = validatePublishedBinding(config, deploymentId,
      structuredClone(await timed(() => config.lookupDeployment(deploymentId, controller.signal), controller.signal))) }
    finally { clearTimeout(timer) }
    await makeRoom()
    const job = { deploymentId, applicationId: binding.applicationId, versionId: binding.versionId,
      sourceDigest: binding.sourceDigest, artifactDigest: binding.artifactDigest, entryPath: binding.entryPath,
      status: 'FAILED', attempts: 0, failureCode, imageDigest: null, imageBytes: null, completedAt: Date.now() }
    await mkdir(join(root, deploymentId), { mode: 0o700 }); await save(job); jobs.set(deploymentId, job)
    return view(job)
  }
  async function run() {
    const job = [...jobs.values()].find(value => value.status === 'QUEUED')
    if (!job) return null
    activeId = job.deploymentId
    while (job.attempts < maxAttempts) {
      job.status = 'RUNNING'; job.attempts++; job.failureCode = null; await save(job)
      const controller = new AbortController(), timer = setTimeout(() => controller.abort(), timeoutMs)
      let retry = true
      try {
        const target = await timed(() => resolveTarget(job.deploymentId, controller.signal), controller.signal)
        if (['applicationId', 'versionId', 'sourceDigest', 'artifactDigest'].some(key => job[key] !== target[key]) ||
            entry(job) !== entry(target)) throw new Error('TARGET_REJECTED')
        const result = await capture(target, { signal: controller.signal, timeoutMs })
        retry = result?.cleanupConfirmed === true
        if (controller.signal.aborted || result?.status !== 'SUCCEEDED' || result.failure !== null || !retry)
          throw new Error(!retry ? 'CLEANUP_FAILED' : controller.signal.aborted ? 'CAPTURE_TIMEOUT' : result?.failure ?? 'CAPTURE_FAILED')
        if (!pngValid(result.png)) throw new Error('CAPTURE_FAILED')
        await writeFile(join(root, job.deploymentId, 'cover.png'), result.png, { flag: 'wx', mode: 0o600 })
        job.imageDigest = digest(result.png); job.imageBytes = result.png.length; job.status = 'SUCCEEDED'; job.failureCode = null
        job.completedAt = Date.now(); await save(job); break
      } catch (error) {
        job.imageDigest = null; job.imageBytes = null
        job.failureCode = ['TARGET_REJECTED', 'CAPTURE_TIMEOUT', 'CAPTURE_FAILED', 'CLEANUP_FAILED'].includes(error.message) ? error.message : 'CAPTURE_FAILED'
        if (job.failureCode === 'TARGET_REJECTED' || !retry || job.attempts >= maxAttempts) { job.status = 'FAILED'; job.completedAt = Date.now(); await save(job); break }
        job.status = 'RETRYING'; await save(job)
      } finally { clearTimeout(timer) }
    }
    return view(job)
  }
  function serialize(operation) { const promise = writing.then(operation); writing = promise.catch(() => {}); return promise }
  return {
    // Serialize admission, including duplicate calls awaiting the same filesystem entry.
    enqueue(id) { return serialize(() => enqueue(id)) },
    recordAdmissionFailure(id, code) { return serialize(() => admissionFailure(id, code)) },
    get(id) { return view(jobs.get(id)) },
    image(id) { return serialize(async () => {
      const job = jobs.get(id)
      if (job?.status !== 'SUCCEEDED') throw new Error('COVER_UNAVAILABLE')
      await canonical(join(root, id))
      const snapshot = await readSnapshot(join(root, id), { files: 5, bytes: 7 * 1024 * 1024 })
      const png = snapshot.buffers.get('cover.png')
      if (!pngValid(png) || digest(png) !== job.imageDigest || png.length !== job.imageBytes) throw new Error('COVER_UNAVAILABLE')
      return png
    }) },
    runNext() { if (closed) throw new Error('QUEUE_CLOSED'); if (!active) active = writing.then(run).finally(() => { active = null; activeId = null }); return active },
    async close() { closed = true; await writing; if (active) await active; await releaseOwner() },
  }
}
