import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { dedicatedHostname, siteKey } from '../../services/runner/src/preview/site-policy.mjs'
import { previewOrigins } from '../../services/runner/src/preview/credentials.mjs'
import { publicationSite, deploymentUrl } from '../../services/runner/src/publish/policy.mjs'
import { hostingConfig } from '../../infra/hosting/render.mjs'

test('runner matches the shared Java/browser site-boundary cases', async () => {
  const cases = JSON.parse(await readFile(new URL('../../services/api/src/test/resources/network/site-cases.json', import.meta.url)))
  for (const { host, site } of cases) {
    assert.equal(dedicatedHostname(host), site !== null, host)
    if (site !== null) assert.equal(siteKey(host), site, host)
  }
  assert.equal(dedicatedHostname('app.' + 'a'.repeat(64) + '.cn'), false)
})

test('cn/top and mixed dedicated sites render bound publication hosts; old suffixes still work', async () => {
  for (const [platformSuffix, previewSuffix, publicationSuffix] of [
    ['cn', 'cn', 'cn'], ['top', 'top', 'top'], ['com', 'cn', 'top'],
    ...['test', 'com', 'net', 'org', 'dev', 'app'].map(suffix => [suffix, suffix, suffix]),
  ]) {
    const platformOrigin = `https://app.codeless-platform.${platformSuffix}`
    const previewOrigin = `https://preview.codeless-preview.${previewSuffix}`
    const publicOrigin = `https://sites.codeless-public.${publicationSuffix}`
    assert.equal(previewOrigins(previewOrigin, platformOrigin).preview.origin, previewOrigin)
    const { site } = publicationSite(publicOrigin, platformOrigin, previewOrigin)
    assert.equal(deploymentUrl('11111111-1111-4111-8111-111111111111', site),
      publicOrigin.replace('https://', 'https://d11111111111141118111111111111111.') + '/')
    const config = await hostingConfig({ publicOrigin, platformOrigin, previewOrigin })
    assert.ok(config.includes(site.hostname.replaceAll('.', '\\.')))
    assert.ok(config.includes('location / { return 404; }'))
    assert.ok(config.includes('disable_symlinks on'))
  }
})

test('new suffixes cannot collapse preview/publication/platform into one site or admit unsupported origins', () => {
  for (const suffix of ['cn', 'top']) {
    const platform = `https://app.codeless.${suffix}`, preview = `https://preview.other.${suffix}`
    assert.throws(() => previewOrigins(`https://preview.codeless.${suffix}`, platform), /separate preview site/)
    assert.throws(() => publicationSite(`https://sites.codeless.${suffix}`, platform, preview), /separate preview site/)
    assert.throws(() => publicationSite(`https://sites.other.${suffix}`, platform, preview), /separate site/)
    for (const invalid of [`http://sites.third.${suffix}`, `https://user:pass@sites.third.${suffix}`,
      `https://sites.third.${suffix}/path`, `https://sites.third.${suffix}?x=1`, `https://sites.third.${suffix}#x`])
      assert.throws(() => publicationSite(invalid, platform, preview))
    assert.throws(() => publicationSite(`https://sites.third.${suffix}`, platform, 'https://preview.example.com.cn'))
  }
})
