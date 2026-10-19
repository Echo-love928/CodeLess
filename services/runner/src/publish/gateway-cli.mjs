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
  if (!['publish', 'probe'].includes(job.action)) throw new Error('gateway action rejected')
  const gateway = await createFrozenGateway(config)
  const result = job.action === 'publish'
    ? await gateway.publish(job.payload, job.deadline)
    : await gateway.probe(job.payload, job.url, job.deadline)
  // Detailed probe diagnostics stay private; stdout is a bounded typed response.
  process.stdout.write(JSON.stringify(job.action === 'publish' ? result : {
    accessible: result.accessible, versionId: result.versionId, artifactDigest: result.artifactDigest,
  }))
} catch {
  process.stderr.write('PUBLICATION_GATEWAY_FAILED\n')
  process.exitCode = 1
}
