import { expect, test, type Page } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { visualFixture } from '../../e2e/visual-edit/fixture'
import { appId, ids, versions, installVersionsFixture, openWorkbench } from '../../e2e/versions/fixture'

// Named UI contract fixtures. Chromium/UI are real; HTTP/model/build are doubles.
async function chooseWithKeyboard(page: Page) {
  const summary = page.getByText('使用键盘选择源码组件', { exact: true })
  await summary.focus()
  if (!await summary.evaluate(element => (element.parentElement as HTMLDetailsElement).open)) await page.keyboard.press('Enter')
  await page.keyboard.press('Tab')
  await expect(page.getByRole('button', { name: '选择 shared-card', exact: true })).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page.getByLabel('组件修改描述')).toBeVisible()
}

test('D26-B-T1: keyboard selects a server-resolved source component and completes an edit', async ({ page }, info) => {
  const state = await visualFixture(page)
  await chooseWithKeyboard(page)
  expect(state.selections).toEqual([{ componentId: 'shared-card', versionId: ids[1], sourceDigest: state.payloads.get(ids[1])!.digest }])
  await page.getByRole('button', { name: '取消源码组件选择', exact: true }).focus()
  await page.keyboard.press('Enter')
  await expect(page.getByLabel('组件修改描述')).toHaveCount(0)
  await expect(page.getByText('使用键盘选择源码组件', { exact: true })).toBeFocused()
  expect(state.edits).toHaveLength(0)
  await chooseWithKeyboard(page)
  await page.getByLabel('组件修改描述').focus()
  await page.keyboard.type('将文案改为键盘修改')
  await page.keyboard.press('Tab')
  await expect(page.getByLabel('我确认修改影响整个源码组件及所有共享实例')).toBeFocused()
  await page.keyboard.press('Space')
  await page.keyboard.press('Tab')
  await page.keyboard.press('Enter')
  expect(state.edits).toHaveLength(1)
  expect(state.edits[0]).toEqual({ baseVersionId: ids[1], prompt: '将文案改为键盘修改', selection: state.selections[0] })
  await state.finish('READY', { text: '键盘修改' })
  await expect(page.frameLocator('iframe').locator('article a').first()).toHaveText('键盘修改 1')
  await expect(page.getByLabel('组件修改描述')).toHaveCount(0)
  await page.screenshot({ path: info.outputPath('keyboard-edit.png'), fullPage: true })
})

async function publishFixture(page: Page) {
  await installVersionsFixture(page)
  await page.route('**/codeless-publication-config.json', route => route.fulfill({ json: { publicOrigin: 'https://sites.codeless-public.test' } }))
  const posts: Record<string, unknown>[] = []
  const publicationId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  let status = 'REQUESTED'
  const publication = () => ({ id: publicationId, applicationId: appId, versionId: ids[1], requestedBy: 'user-1', status,
    createdAt: '2026-10-31T00:00:00Z', ...(status === 'PUBLISHED' ? {
      url: `https://d${publicationId.replaceAll('-', '')}.sites.codeless-public.test/`, publishedAt: '2026-10-31T00:01:00Z' } : {}) })
  await page.route('**/api/v0/publications', route => {
    expect(route.request().method()).toBe('POST')
    expect(route.request().headers()['x-csrf-token']).toBe('test-csrf-token')
    expect(route.request().headers()['idempotency-key']).toMatch(/^[A-Za-z0-9_-]{16,128}$/)
    posts.push(route.request().postDataJSON())
    return route.fulfill({ status: 202, json: publication() })
  })
  await page.route(`**/api/v0/publications/${publicationId}`, route => route.fulfill({ json: publication() }))
  await page.route(`**/api/v0/applications/${appId}/publications`, route => route.fulfill({ json: {
    items: posts.length ? [publication()] : [], latestSuccessful: status === 'PUBLISHED' ? publication() : null } }))
  await page.route(`**/api/v0/publications/${publicationId}/cover`, route => route.fulfill({ json: {
    deploymentId: publicationId, applicationId: appId, versionId: ids[1], sourceDigest: versions[1].sourceDigest,
    artifactDigest: 'sha256:' + 'b'.repeat(64), status: 'FAILED', failureCode: 'CAPTURE_TIMEOUT', attempts: 2, imageDigest: null, imageBytes: null } }))
  for (const version of versions) await page.route(`**/api/v0/versions/${version.id}`, route => route.fulfill({ json: version }))
  for (const version of versions.filter(value => value.status === 'VERIFIED')) await page.route(`**/api/v0/versions/${version.id}/snapshot`, route => route.fulfill({ json: {
    versionId: version.id, status: version.status, sourceDigest: version.sourceDigest, validation: { status: version.status,
      sourceDigest: version.sourceDigest, artifactDigest: 'sha256:' + 'b'.repeat(64), report: { buildId: version.buildId,
        buildStatus: 'SUCCEEDED', exitCode: 0, verificationStatus: 'PASSED', artifactDigest: 'sha256:' + 'b'.repeat(64) } } } }))
  await openWorkbench(page)
  return { posts, status: (value: string) => { status = value } }
}

test('D26-B-T1: opening publication moves focus inside; Escape returns to trigger', async ({ page }, info) => {
  await publishFixture(page)
  const trigger = page.getByRole('button', { name: '发布', exact: true })
  await trigger.focus()
  await page.keyboard.press('Enter')
  const panel = page.getByRole('region', { name: '发布面板' })
  await expect(panel.getByRole('button', { name: '关闭发布面板' })).toBeFocused()
  await expect(trigger).toHaveAttribute('aria-controls', await panel.getAttribute('id') as string)
  await page.keyboard.press('Escape')
  await expect(panel).toHaveCount(0)
  await expect(trigger).toBeFocused()
  await page.keyboard.press('Enter')
  await page.setViewportSize({ width: 375, height: 812 })
  await expect(panel.getByRole('button', { name: '关闭发布面板' })).toBeFocused()
  expect(await panel.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true)
  await panel.screenshot({ path: info.outputPath('keyboard-publication-mobile.png') })
})

test('D26-B-T2: keyboard path preserves server rejection, composition and unknown task state', async ({ page }, info) => {
  const state = await visualFixture(page)
  state.denySelection(409)
  await chooseWithKeyboardRejected()
  await expect(page.getByRole('region', { name: '组件修改', exact: true }).getByRole('alert')).toContainText('版本已变化')
  await expect(page.getByLabel('组件修改描述')).toHaveCount(0)
  expect(state.edits).toHaveLength(0)
  state.denySelection(200)
  await chooseWithKeyboard(page)
  await page.getByLabel('组件修改描述').fill('保留这段描述')
  state.denyEdit(409)
  await submitWithKeyboard()
  await expect(page.getByRole('region', { name: '组件修改', exact: true }).getByRole('alert')).toContainText('你的描述已保留')
  await expect(page.getByLabel('组件修改描述')).toHaveValue('保留这段描述')
  expect(state.edits).toHaveLength(1)
  state.denyEdit(202)
  await chooseWithKeyboard(page)
  await expect(page.getByLabel('我确认修改影响整个源码组件及所有共享实例')).not.toBeChecked()
  await submitWithKeyboard()
  await state.finish('FUTURE') // Advance the named HTTP fixture; this is not a real model result.
  await expect(page.getByRole('region', { name: '组件修改任务', exact: true })).toContainText('任务状态未知')
  await expect(page.getByRole('button', { name: '选择 shared-card', exact: true })).toBeDisabled()
  await expect(page.locator('iframe')).toHaveAttribute('src', new RegExp(ids[1].replaceAll('-', '')))
  expect(state.edits).toHaveLength(2)
  await page.screenshot({ path: info.outputPath('unknown-retains-version.png'), fullPage: true })

  async function chooseWithKeyboardRejected() {
    await page.getByText('使用键盘选择源码组件', { exact: true }).focus()
    await page.keyboard.press('Enter'); await page.keyboard.press('Tab'); await page.keyboard.press('Enter')
  }
  async function submitWithKeyboard() {
    await page.getByLabel('我确认修改影响整个源码组件及所有共享实例').focus()
    await page.keyboard.press('Space'); await page.keyboard.press('Tab'); await page.keyboard.press('Enter')
  }
})

test('D26-B-T3: publication and its download bind one version; mismatched download fails visibly', async ({ page }, info) => {
  const state = await publishFixture(page)
  const exports: string[] = [], downloads: string[] = []
  // Explicit transport fixture; the full-product gate separately verifies real ZIP manifests/bytes.
  const bytes = Buffer.from([80, 75, 3, 4, 26, 0, 0, 0])
  let mismatch = false
  await page.route('**/api/v0/versions/*/export', route => {
    const id = new URL(route.request().url()).pathname.split('/versions/')[1].split('/')[0]
    exports.push(id)
    return route.fulfill({ contentType: 'application/zip', body: bytes, headers: {
      'X-CodeLess-Version-Id': mismatch ? ids[0] : id, 'X-CodeLess-Source-Digest': versions[1].sourceDigest } })
  })
  page.on('download', download => downloads.push(download.suggestedFilename()))
  // A historical preview does not silently replace the explicitly labelled publication target.
  await page.locator(`[data-version-id="${ids[0]}"]`).getByRole('button').focus()
  await page.keyboard.press('Enter')
  await expect(page.locator('iframe')).toHaveAttribute('src', new RegExp(ids[0].replaceAll('-', '')))
  await page.getByRole('button', { name: '发布', exact: true }).focus()
  await page.keyboard.press('Enter')
  const panel = page.getByRole('region', { name: '发布面板' })
  await expect(panel).toContainText('待发布版本：v2')
  expect(state.posts).toHaveLength(0)
  await page.getByLabel('我确认公开发布上方版本').focus()
  await page.keyboard.press('Space'); await page.keyboard.press('Tab'); await page.keyboard.press('Enter')
  await expect(panel).toContainText('已受理，正在部署与检查')
  await expect(panel.getByRole('link')).toHaveCount(0)
  expect(state.posts).toEqual([{ applicationId: appId, versionId: ids[1], artifactDigest: 'sha256:' + 'b'.repeat(64) }])
  state.status('PUBLISHED')
  await panel.getByRole('button', { name: '刷新发布状态', exact: true }).focus()
  await page.keyboard.press('Enter')
  await expect(panel).toContainText('发布成功，公开地址已通过访问检查')
  await expect(panel).toContainText('网站仍已发布') // Cover failure must stay visible, independent of publication.
  await expect(panel).toContainText(`分享版本：${ids[1]}`)
  const pending = page.waitForEvent('download')
  await panel.getByRole('button', { name: '下载源码 · v2', exact: true }).focus()
  await page.keyboard.press('Enter')
  const download = await pending
  expect(download.suggestedFilename()).toBe(`codeless-${ids[1]}.zip`)
  expect(await readFile((await download.path())!)).toEqual(bytes)
  await expect(panel.getByRole('button', { name: '下载源码 · v2', exact: true })).toBeFocused()
  mismatch = true
  await page.keyboard.press('Enter')
  await expect(panel.getByRole('alert')).toContainText('已停止下载')
  expect(downloads).toEqual([`codeless-${ids[1]}.zip`])
  expect(exports).toEqual([ids[1], ids[1]])
  await info.attach('version-binding', { body: JSON.stringify({ mode: 'UI_CONTRACT_FIXTURE', posts: state.posts, exports, downloads }), contentType: 'application/json' })
  await panel.screenshot({ path: info.outputPath('publication-download-binding.png') })
})

test('download completion preserves focus deliberately moved to another control', async ({ page }) => {
  await publishFixture(page)
  const bytes = Buffer.from([80, 75, 3, 4, 26, 0, 0, 0])
  let release!: () => void
  const ready = new Promise<void>(done => { release = done })
  await page.route(`**/api/v0/versions/${ids[1]}/export`, async route => {
    await ready
    await route.fulfill({ contentType: 'application/zip', body: bytes, headers: {
      'X-CodeLess-Version-Id': ids[1], 'X-CodeLess-Source-Digest': versions[1].sourceDigest } })
  })
  await page.getByRole('button', { name: '发布', exact: true }).focus()
  await page.keyboard.press('Enter')
  const panel = page.getByRole('region', { name: '发布面板' })
  const request = page.waitForRequest(`**/api/v0/versions/${ids[1]}/export`)
  await panel.getByRole('button', { name: '下载源码 · v2', exact: true }).focus()
  await page.keyboard.press('Enter')
  await request
  const other = panel.getByRole('button', { name: '关闭发布面板', exact: true })
  await other.focus()
  release()
  await expect(panel).toContainText('已开始下载版本 v2')
  await expect(other).toBeFocused()
})
