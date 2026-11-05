import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { renderPreviewDeployment } from '../../infra/preview/render.mjs'
import { publicConfiguration } from '../../infra/public/render.mjs'

test('preview CSP permits the configured HTTPS port and retains the frame boundary', { skip: process.getuid?.() === 0 }, async () => {
  const root = await mkdtemp(join(tmpdir(), 'codeless-csp-'))
  try {
    const dist = join(root,'web'); await mkdir(dist)
    await writeFile(join(dist,'index.html'),'<html></html>')
    await writeFile(join(root,'cert.pem'),'configuration-only fixture')
    await writeFile(join(root,'key.pem'),'configuration-only fixture')
    const result = await renderPreviewDeployment({
      CODELESS_PLATFORM_ORIGIN:'https://platform.codeless.test:18443',
      CODELESS_PREVIEW_ORIGIN:'https://preview.codeless-preview.test:18443',
      CODELESS_API_PORT:'18080',CODELESS_PREVIEW_GATEWAY_PORT:'18788',
      CODELESS_PREVIEW_DEPLOY_ROOT:join(root,'ingress'),CODELESS_TLS_CERT:join(root,'cert.pem'),CODELESS_TLS_KEY:join(root,'key.pem'),CODELESS_WEB_DIST:dist,
    })
    const config = await readFile(result.configPath,'utf8')
    assert.equal(config.split('frame-src https://*.preview.codeless-preview.test:18443;').length,3)
    assert.ok(config.includes("frame-ancestors 'none'"))
    assert.ok(!config.includes('preview.codeless-preview.test:*'))
    assert.ok(!config.includes('CODELESS_'))
  } finally { await rm(root,{recursive:true,force:true}) }
})
test('public standard-port CSP retains only the configured preview site',async()=>{
  const result = await publicConfiguration({CODELESS_PLATFORM_ORIGIN:'https://app.codeless-platform.top',CODELESS_PREVIEW_ORIGIN:'https://preview.codeless-preview.top',CODELESS_PUBLICATION_ORIGIN:'https://sites.codeless-publish.top'})
  assert.equal(result.platform.split('frame-src https://*.preview.codeless-preview.top;').length,3)
  assert.ok(!result.platform.includes('CODELESS_'))
})
