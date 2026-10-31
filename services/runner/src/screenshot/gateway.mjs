import { readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { canonical } from '../preview/registry.mjs'
import { readSnapshot } from '../artifacts/snapshot.mjs'
import { pathToFileURL } from 'node:url'
import { createScreenshotQueue } from './queue.mjs'
import { createTargetResolver, validatePublishedBinding } from './target.mjs'
import { uuid } from '../preview/credentials.mjs'

const keys = (value, expected) => value && typeof value === 'object' && !Array.isArray(value) &&
  JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...expected].sort())
export function validateCoverRequest(job, now = Date.now()) {
  if (!keys(job, ['action', 'binding', 'deadline']) || job.action !== 'capture' || typeof job.deadline !== 'string' ||
      !keys(job.binding, ['id', 'applicationId', 'versionId', 'status', 'sourceDigest', 'artifactDigest', 'url', 'entryPath']))
    throw new Error('COVER_REQUEST_REJECTED')
  const remaining = Date.parse(job.deadline) - now
  if (!Number.isFinite(remaining) || remaining < 6000 || remaining > 45000) throw new Error('COVER_DEADLINE_REJECTED')
  return remaining
}

// Trusted installed process only, never a model tool or HTTP enqueue endpoint.
// resolveDns is an explicit private integration dependency, not accepted in JSON/config fields.
export async function runCoverGateway(config, job, { resolveDns } = {}) {
  const remaining = validateCoverRequest(job), projection = structuredClone(job.binding), id = projection.id
  const binding = validatePublishedBinding(config, id, projection)
  // A previous process's unknown browser state requires operator recovery. Do not
  // let queue startup convert RUNNING/RETRYING into an automatically recoverable failure.
  const root = await canonical(config.queueRoot)
  for (const name of await readdir(root)) {
    if (!uuid.test(name)) continue
    const snapshot = await readSnapshot(await canonical(join(root, name)), { files: 5, bytes: 7 * 1024 * 1024 })
    const previous = JSON.parse(snapshot.buffers.get('job.json')?.toString() ?? 'null')
    if (['RUNNING', 'RETRYING'].includes(previous?.status)) throw new Error('COVER_PENDING_RECOVERY')
  }
  const queueConfig = { ...config, lookupDeployment: async key => key === id ? structuredClone(projection) : null,
    timeoutMs: Math.min(12000, Math.floor((remaining - 5000) / 3)), maxAttempts: 2 }
  const resolver = createTargetResolver(queueConfig, resolveDns)
  const queue = await createScreenshotQueue(queueConfig, { resolveTarget: resolver })
  try {
    for (const name of await readdir(config.queueRoot)) {
      if (uuid.test(name) && name !== id && queue.get(name)?.status === 'QUEUED') throw new Error('COVER_PENDING_RECOVERY')
    }
    let record = queue.get(id)
    if (record) {
      for (const key of ['deploymentId', 'applicationId', 'versionId', 'sourceDigest', 'artifactDigest', 'entryPath'])
        if (record[key] !== binding[key]) throw new Error('COVER_BINDING_REJECTED')
    } else {
      try { record = await queue.enqueue(id) }
      catch (failure) {
        const code = ['TARGET_REJECTED', 'CAPTURE_TIMEOUT'].includes(failure.message) ? failure.message : 'CAPTURE_FAILED'
        record = await queue.recordAdmissionFailure(id, code)
      }
    }
    if (record.status === 'QUEUED') record = await queue.runNext()
    if (!record || !['SUCCEEDED', 'FAILED'].includes(record.status)) throw new Error('COVER_RESULT_UNCONFIRMED')
    return { record }
  } finally { await queue.close() }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    let size = 0; const chunks = []
    for await (const chunk of process.stdin) { size += chunk.length; if (size > 8192) throw new Error('COVER_INPUT_LIMIT'); chunks.push(chunk) }
    const config = { queueRoot: process.env.CODELESS_COVER_QUEUE_ROOT, hostingRoot: process.env.CODELESS_HOSTING_ROOT,
      publicOrigin: process.env.CODELESS_PUBLICATION_ORIGIN, platformOrigin: process.env.CODELESS_PLATFORM_ORIGIN,
      previewOrigin: process.env.CODELESS_PREVIEW_ORIGIN }
    const response = await runCoverGateway(config, JSON.parse(Buffer.concat(chunks).toString('utf8')))
    process.stdout.write(JSON.stringify(response))
  } catch { process.stderr.write('COVER_GATEWAY_REJECTED\n'); process.exitCode = 1 }
}
