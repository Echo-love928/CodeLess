import { expect, test, type Page } from '@playwright/test'
import { readFile, mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { installVersionsFixture, openWorkbench, appId, ids, versions } from '../versions/fixture'

const deploymentId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const publication = { id: deploymentId, applicationId: appId, versionId: ids[0], requestedBy: 'user-1', status: 'PUBLISHED',
  createdAt: '2026-10-19T00:00:00Z', publishedAt: '2026-10-19T00:01:00Z', url: `https://d${deploymentId.replaceAll('-', '')}.sites.codeless-public.test/` }
const evidence = resolve('../../tests/e2e/share/evidence/2026-10-19')
async function fixture(page: Page) {
  await installVersionsFixture(page)
  await page.route('**/codeless-publication-config.json', route => route.fulfill({ json: { publicOrigin: 'https://sites.codeless-public.test' } }))
  await page.route(`**/api/v0/applications/${appId}/publications`, route => route.fulfill({ json: { items: [publication], latestSuccessful: publication } }))
  for (const version of versions) await page.route(`**/api/v0/versions/${version.id}`, route => route.fulfill({ json: version }))
  for (const version of versions.filter(value => value.status === 'VERIFIED')) await page.route(`**/api/v0/versions/${version.id}/snapshot`, route => route.fulfill({ json: {
    versionId: version.id, status: version.status, sourceDigest: version.sourceDigest, validation: { status: version.status,
      sourceDigest: version.sourceDigest, artifactDigest: 'sha256:' + 'b'.repeat(64), report: { buildId: version.buildId,
        buildStatus: 'SUCCEEDED', exitCode: 0, verificationStatus: 'PASSED', artifactDigest: 'sha256:' + 'b'.repeat(64) } } } }))
  await page.route(`**/api/v0/publications/${deploymentId}/cover`, route => route.fulfill({ json: {
    deploymentId, applicationId: appId, versionId: ids[0], sourceDigest: versions[0].sourceDigest, artifactDigest: 'sha256:' + 'b'.repeat(64),
    status: 'FAILED', failureCode: 'CAPTURE_TIMEOUT', attempts: 2, imageDigest: null, imageBytes: null } }))
  await openWorkbench(page)
}

test('T2/T4: cover timeout retains successful share URL, distinct selected version and usable mobile layout', async ({ page }) => {
  await fixture(page)
  await page.setViewportSize({ width: 375, height: 812 })
  await page.getByRole('button', { name: '发布', exact: true }).click()
  const panel = page.getByRole('region', { name: '发布面板' })
  await expect(panel).toContainText('网站仍已发布')
  await expect(panel.getByRole('img', { name: '应用封面占位图' })).toBeVisible()
  await expect(panel.getByRole('link')).toHaveAttribute('href', publication.url)
  await expect(panel).toContainText(`分享版本：${ids[0]}`)
  await expect(panel.getByRole('button', { name: '下载源码 · v2' })).toBeVisible()
  await expect(panel).toContainText('当前选定版本与分享版本不同')
  expect(await panel.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true)
  await panel.getByRole('link').scrollIntoViewIfNeeded()
  await mkdir(evidence, { recursive: true }); await panel.screenshot({ path: resolve(evidence, 'T2-mobile-placeholder.png') })
})

test('T4: actual browser download requests exactly the selected historical version; rejected binding never downloads', async ({ page }) => {
  await fixture(page)
  const requests: string[] = []
  let mismatch = false
  // Explicit UI transport fixture; the adapter unit test separately uses A's real ZIP.
  const zip = Buffer.from([80, 75, 3, 4, 1, 2, 3, 4])
  await page.route('**/api/v0/versions/*/export', route => {
    const id = new URL(route.request().url()).pathname.split('/versions/')[1].split('/')[0]
    requests.push(id)
    const version = versions.find(value => value.id === id)!
    return route.fulfill({ contentType: 'application/zip', body: zip, headers: {
      'X-CodeLess-Version-Id': mismatch ? ids[1] : id, 'X-CodeLess-Source-Digest': version.sourceDigest } })
  })
  await page.locator(`[data-version-id="${ids[0]}"]`).getByRole('button').click()
  const source = page.getByRole('region', { name: '只读源码' })
  await expect(source).toContainText(`版本 1`)
  const pending = page.waitForEvent('download')
  await source.getByRole('button', { name: '下载源码 · v1' }).click()
  const download = await pending
  expect(download.suggestedFilename()).toBe(`codeless-${ids[0]}.zip`)
  expect(await readFile((await download.path())!)).toEqual(zip)
  expect(requests).toEqual([ids[0]])
  mismatch = true
  const downloads: string[] = []; page.on('download', download => downloads.push(download.suggestedFilename()))
  await source.getByRole('button', { name: '下载源码 · v1' }).click()
  await expect(source.getByRole('alert')).toContainText('已停止下载')
  expect(downloads).toEqual([]); expect(requests).toEqual([ids[0], ids[0]])
  for (const index of [2, 3]) {
    await page.locator(`[data-version-id="${ids[index]}"]`).getByRole('button').click()
    await expect(source.getByRole('button', { name: `下载源码 · v${index + 1}` })).toBeDisabled()
    await expect(source).toContainText(index === 2 ? '尚未验证' : '验证失败的版本不可下载')
  }
  expect(requests).toEqual([ids[0], ids[0]])
})
