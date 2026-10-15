import { expect, test, type Page } from '@playwright/test'
import { installVersionsFixture, openWorkbench, ids, appId, versions } from '../versions/fixture'

const artifactDigest = 'sha256:' + 'b'.repeat(64)
const publicationIds = ['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb']
async function fixture(page: Page) {
  await page.route('**/codeless-publication-config.json', route => route.fulfill({ json: { publicOrigin: 'https://sites.codeless-public.test' } }))
  await installVersionsFixture(page)
  for (const version of versions) await page.route(`**/api/v0/versions/${version.id}`, route => route.fulfill({ json: version }))
  for (const version of versions.filter(item => item.status === 'VERIFIED')) await page.route(`**/api/v0/versions/${version.id}/snapshot`, route => route.fulfill({ json: { versionId: version.id, status: version.status, sourceDigest: version.sourceDigest, validation: { status: version.status, sourceDigest: version.sourceDigest, artifactDigest, report: { buildId: version.buildId, buildStatus: 'SUCCEEDED', exitCode: 0, verificationStatus: 'PASSED', artifactDigest } } } }))
  let status = 'REQUESTED', posts = 0, malformed = false, prior = false, unknownAttempts = false, loseFirstResponse = false
  const keys: string[] = []
  const submitted: { applicationId: string; versionId: string; artifactDigest: string }[] = []
  const publication = (id: string, state: string, versionId = ids[1]) => ({ id, applicationId: appId, versionId, requestedBy: 'user-1', status: state,
    createdAt: '2026-10-14T00:00:00Z', ...(state === 'PUBLISHED' ? { url: `https://d${id.replaceAll('-', '')}.sites.codeless-public.test/`, publishedAt: '2026-10-14T00:01:00Z' } : {}) })
  await page.route('**/api/v0/publications', async route => {
    expect(route.request().method()).toBe('POST')
    expect(route.request().headers()['x-csrf-token']).toBe('test-csrf-token')
    expect(route.request().headers()['idempotency-key']).toMatch(/^[A-Za-z0-9_-]{16,128}$/)
    keys.push(route.request().headers()['idempotency-key'])
    posts++; submitted.push(route.request().postDataJSON())
    if (loseFirstResponse && posts === 1) return route.abort('failed')
    return route.fulfill({ status: 202, json: publication(publicationIds[1], malformed ? 'FUTURE' : 'REQUESTED') })
  })
  await page.route('**/api/v0/publications/*', route => {
    const id = new URL(route.request().url()).pathname.split('/').at(-1)!
    return route.fulfill({ json: publication(id, id === publicationIds[0] ? 'PUBLISHED' : status) })
  })
  await page.route(`**/api/v0/applications/${appId}/publications`, route => route.fulfill({ json: { items: unknownAttempts ? [publication(publicationIds[1], 'FUTURE')] : posts && !malformed ? [publication(publicationIds[1], status)] : [], latestSuccessful: status === 'PUBLISHED' ? publication(publicationIds[1], status) : prior ? publication(publicationIds[0], 'PUBLISHED') : null } }))
  await openWorkbench(page)
  return { submitted, keys, prior: () => { prior = true }, unknownAttempts: () => { unknownAttempts = true }, loseFirstResponse: () => { loseFirstResponse = true }, posts: () => posts, status: (value: string) => { status = value }, malformed: () => { malformed = true } }
}
test('D15-B-T4: explicit confirmation, exact version and failed deployment retains recoverable successful address', async ({ page }, info) => {
  const state = await fixture(page)
  state.prior() // Cold browser: success exists only on the server, no saved publication ID.
  expect(await page.evaluate(() => sessionStorage.length)).toBe(0)
  await page.reload()
  await page.getByRole('button', { name: '发布', exact: true }).click()
  const panel = page.getByRole('region', { name: '发布面板' })
  await expect(panel).toContainText(`待发布版本：v2`)
  await expect(panel.getByRole('button', { name: '确认发布', exact: true })).toBeDisabled()
  expect(state.posts()).toBe(0)
  await page.getByLabel('我确认公开发布上方版本').check()
  await panel.getByRole('button', { name: '确认发布', exact: true }).click()
  await expect(panel).toContainText('已受理，正在部署与检查')
  expect(state.submitted).toEqual([{ applicationId: appId, versionId: ids[1], artifactDigest }])
  await expect(panel.getByRole('button', { name: '确认发布', exact: true })).toBeDisabled()
  state.status('FAILED')
  await panel.getByRole('button', { name: '刷新发布状态' }).click()
  await expect(panel.getByRole('alert')).toContainText('上次成功版本和地址仍然保留')
  await expect(panel.getByRole('link')).toHaveAttribute('href', `https://d${publicationIds[0].replaceAll('-', '')}.sites.codeless-public.test/`)
  await panel.getByRole('button', { name: '复制公开地址' }).click()
  await expect(panel).toContainText(/公开地址已复制|复制失败，请选中下方地址手动复制/)
  await page.screenshot({ path: info.outputPath('failed-deployment-retains-success.png'), fullPage: true })
  await page.reload(); await page.getByRole('button', { name: '发布', exact: true }).click()
  await expect(page.getByRole('region', { name: '发布面板' }).getByRole('link')).toHaveAttribute('href', new RegExp(publicationIds[0].replaceAll('-', '')))
  expect(state.posts()).toBe(1)
})
test('published state shows address only after server success; keyboard/mobile panel remains usable', async ({ page }, info) => {
  const state = await fixture(page)
  await page.setViewportSize({ width: 375, height: 812 })
  await page.getByRole('button', { name: '发布', exact: true }).focus(); await page.keyboard.press('Enter')
  const panel = page.getByRole('region', { name: '发布面板' })
  await page.getByLabel('我确认公开发布上方版本').check()
  await panel.getByRole('button', { name: '确认发布', exact: true }).click()
  await expect(panel).toContainText('已受理')
  await expect(panel.getByRole('link')).toHaveCount(0)
  state.status('PUBLISHED'); await panel.getByRole('button', { name: '刷新发布状态' }).click()
  await expect(panel).toContainText('发布成功，公开地址已通过访问检查')
  await expect(panel.getByRole('link')).toHaveAttribute('rel', 'noopener noreferrer')
  expect(await panel.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true)
  await page.screenshot({ path: info.outputPath('mobile-published.png'), fullPage: true })
})
test('unknown response cannot become success or automatically trigger another deployment', async ({ page }) => {
  const state = await fixture(page); state.malformed()
  await page.getByRole('button', { name: '发布', exact: true }).click()
  const panel = page.getByRole('region', { name: '发布面板' })
  await page.getByLabel('我确认公开发布上方版本').check()
  await panel.getByRole('button', { name: '确认发布', exact: true }).click()
  await expect(panel).toContainText('提交结果未知')
  await expect(panel.getByRole('link')).toHaveCount(0)
  await page.reload(); await page.getByRole('button', { name: '发布', exact: true }).click()
  await expect(page.getByRole('region', { name: '发布面板' })).toContainText('上次提交结果未知')
  expect(state.posts()).toBe(1)
})

test('cold session retains independently validated server success beside unknown attempts', async ({ page }) => {
  const state = await fixture(page); state.prior(); state.unknownAttempts()
  await page.reload(); await page.getByRole('button', { name: '发布', exact: true }).click()
  const panel = page.getByRole('region', { name: '发布面板' })
  await expect(panel.getByRole('link')).toHaveAttribute('href', new RegExp(publicationIds[0].replaceAll('-', '')))
  await expect(panel).toContainText('提交结果未知')
  await expect(panel.getByRole('button', { name: '确认发布', exact: true })).toBeDisabled()
  expect(state.posts()).toBe(0)
})

test('lost POST response reloads without resubmission; explicit retry reuses exact digest and key', async ({ page }) => {
  const state = await fixture(page); state.loseFirstResponse()
  await page.getByRole('button', { name: '发布', exact: true }).click()
  const panel = page.getByRole('region', { name: '发布面板' })
  await page.getByLabel('我确认公开发布上方版本').check()
  await panel.getByRole('button', { name: '确认发布', exact: true }).click()
  await expect(panel).toContainText('提交结果未知')
  await page.reload(); await page.getByRole('button', { name: '发布', exact: true }).click()
  await expect(panel.getByRole('button', { name: '重试本次提交', exact: true })).toBeVisible()
  expect(state.posts()).toBe(1)
  await panel.getByRole('button', { name: '重试本次提交', exact: true }).click()
  await expect(panel).toContainText('已受理，正在部署与检查')
  expect(state.posts()).toBe(2); expect(new Set(state.keys).size).toBe(1)
  expect(state.submitted[0]).toEqual(state.submitted[1])
})
