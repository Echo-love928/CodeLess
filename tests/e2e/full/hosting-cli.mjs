// Test-only private adapter: real production frozen writer + real local HTTPS reads.
// Never imported by services/runner or used as a public DNS/TLS acceptance result.
import assert from 'node:assert/strict'
import { request } from 'node:https'
import { createFrozenGateway, frozenPayload, deploymentDeadline } from '../../../services/runner/src/publish/frozen-gateway.mjs'
import { deploymentUrl, publicationSite } from '../../../services/runner/src/publish/policy.mjs'
import { digest } from '../../../services/runner/src/artifacts/snapshot.mjs'

let bytes = 0, input = ''
for await (const chunk of process.stdin) {
  bytes += chunk.length
  assert.ok(bytes <= 48 * 1024 * 1024)
  input += chunk
}
const { action, payload, deadline, url } = JSON.parse(input)
const config = { hostingRoot: process.env.CODELESS_HOSTING_ROOT, publicOrigin: process.env.CODELESS_PUBLICATION_ORIGIN,
  platformOrigin: process.env.CODELESS_PLATFORM_ORIGIN, previewOrigin: process.env.CODELESS_PREVIEW_ORIGIN }
const site = publicationSite(config.publicOrigin, config.platformOrigin, config.previewOrigin).site
assert.equal(site.hostname, 'sites.codeless-public.test')
assert.ok(site.port)
if (action === 'publish') {
  const gateway = await createFrozenGateway(config)
  process.stdout.write(JSON.stringify(await gateway.publish(payload, deadline)))
} else {
  assert.equal(action, 'probe')
  const end = deploymentDeadline(deadline), binding = frozenPayload(payload)
  assert.equal(url, deploymentUrl(payload.publicationId, site))
  for (const file of binding.files) {
    const observed = await new Promise((done, reject) => {
      const req = request(url + file.path, { rejectUnauthorized: false,
        // Fixed local test DNS only; never consume a URL or IP from model/user input.
        lookup: (_host, options, cb) => options.all ? cb(null, [{ address: '127.0.0.1', family: 4 }]) : cb(null, '127.0.0.1', 4) }, res => {
        const chunks = []; let size = 0
        res.on('data', chunk => { size += chunk.length; if (size > file.bytes) req.destroy(new Error('oversized asset')); else chunks.push(chunk) })
        res.on('error', reject)
        res.on('end', () => done({ status: res.statusCode, bytes: Buffer.concat(chunks) }))
      })
      req.setTimeout(Math.max(1, Math.min(3000, end - Date.now())), () => req.destroy(new Error('fixture probe timeout')))
      req.on('error', reject); req.end()
    })
    assert.equal(observed.status, 200)
    assert.equal(observed.bytes.length, file.bytes)
    assert.equal(digest(observed.bytes), file.digest)
  }
  process.stdout.write(JSON.stringify({ accessible: true, versionId: binding.versionId, artifactDigest: binding.artifactDigest }))
}
