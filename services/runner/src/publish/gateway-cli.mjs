import { lstat, rename } from 'node:fs/promises'
import { join } from 'node:path'
import { canonical } from '../preview/registry.mjs'
import { uuid } from '../preview/credentials.mjs'
import { createFrozenGateway } from './frozen-gateway.mjs'

// Launched only by the fixed trusted Java adapter over private stdin/stdout.
// No HTTP listener, argv job/path/command, generated code, or model tool registration.
const config = {
  hostingRoot: process.env.CODELESS_HOSTING_ROOT,
  publicOrigin: process.env.CODELESS_PUBLICATION_ORIGIN,
  platformOrigin: process.env.CODELESS_PLATFORM_ORIGIN,
  previewOrigin: process.env.CODELESS_PREVIEW_ORIGIN,
}
try {
  let input = '', size = 0
  for await (const chunk of process.stdin) {
    size += chunk.length
    if (size > 48 * 1024 * 1024) throw new Error('gateway input exceeded')
    input += chunk
  }
  const job = JSON.parse(input)
  if (job.action === 'unpublish') {
    const id = job.payload?.publicationId
    if (!uuid.test(id ?? '') || !Number.isFinite(Date.parse(job.deadline)) || Date.parse(job.deadline) <= Date.now()) throw new Error('invalid unpublish')
    const root = await canonical(config.hostingRoot), source = join(root, id), retired = join(root, `.unpublished-${id}`)
    try {
      const info = await lstat(source)
      if (!info.isDirectory() || info.isSymbolicLink() || await canonical(source) !== source) throw new Error('invalid site')
      await rename(source, retired)
    } catch (error) { if (error.code !== 'ENOENT') throw error }
    process.stdout.write(JSON.stringify({ unpublished: true }))
  } else {
  if (!['publish', 'probe'].includes(job.action)) throw new Error('gateway action rejected')
  const gateway = await createFrozenGateway(config)
  const result = job.action === 'publish'
    ? await gateway.publish(job.payload, job.deadline)
    : await gateway.probe(job.payload, job.url, job.deadline)
  // Detailed probe diagnostics stay private; stdout is a bounded typed response.
  process.stdout.write(JSON.stringify(job.action === 'publish' ? result : {
    accessible: result.accessible, versionId: result.versionId, artifactDigest: result.artifactDigest,
  }))
  }
} catch {
  process.stderr.write('PUBLICATION_GATEWAY_FAILED\n')
  process.exitCode = 1
}
