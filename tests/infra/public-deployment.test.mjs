import test from 'node:test'
import assert from 'node:assert/strict'
import { publicConfiguration } from '../../infra/public/render.mjs'

const origins = { CODELESS_PLATFORM_ORIGIN: 'https://app.codeless-platform.top',
  CODELESS_PREVIEW_ORIGIN: 'https://preview.codeless-preview.top', CODELESS_PUBLICATION_ORIGIN: 'https://sites.codeless-publish.top' }
test('unified ingress preserves original isolation templates and routes only bounded TLS names', async () => {
  const result = await publicConfiguration(origins)
  assert.match(result.edge, /default 127\.0\.0\.1:9/)
  assert.match(result.edge, /ssl_preread on/)
  assert.ok(result.edge.includes('~^v[a-f0-9]{32}\\.preview\\.codeless-preview\\.top$'))
  assert.ok(result.edge.includes('~^d[a-f0-9]{32}\\.sites\\.codeless-publish\\.top$'))
  assert.match(result.platform, /location \^~ \/internal\/ \{ return 404; \}/)
  assert.match(result.platform, /proxy_buffering off/)
  assert.match(result.hosting, /disable_symlinks on/)
  assert.match(result.hosting, /location \/ \{ return 404; \}/)
  assert.equal(result.publicOrigin, origins.CODELESS_PUBLICATION_ORIGIN)
})
test('public assembly refuses alternate ports and shared-site configurations', async () => {
  await assert.rejects(publicConfiguration({ ...origins, CODELESS_PLATFORM_ORIGIN: origins.CODELESS_PLATFORM_ORIGIN + ':18443' }))
  await assert.rejects(publicConfiguration({ ...origins, CODELESS_PUBLICATION_ORIGIN: 'https://sites.codeless-preview.top' }))
})
