import { expect, test } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { ids, versions, malicious, installVersionsFixture, openWorkbench } from './fixture'

const evidence = resolve(process.cwd(), '../../tests/e2e/versions/evidence/2026-10-11')
test.beforeAll(async () => { await mkdir(evidence, { recursive: true }) })

test('D11-B-T1: versionId selects matching source and rendered preview', async ({ page }) => {
  const state = await installVersionsFixture(page)
  await openWorkbench(page)
  await expect(page.frameLocator('iframe').getByRole('heading', { name: '版本 2 页面' })).toBeVisible()
  await expect(page.getByLabel('文件内容')).toContainText('版本 2 页面')
  await page.locator(`[data-version-id="${ids[0]}"]`).getByRole('button').click()
  await expect(page.frameLocator('iframe').getByRole('heading', { name: '版本 1 页面' })).toBeVisible()
  await expect(page.getByLabel('文件内容')).toContainText('版本 1 页面')
  await expect(page.locator('.preview-panel__controls')).toContainText(ids[0])
  expect(state.sourceIds.at(-1)).toBe(ids[0]); expect(state.credentialIds.at(-1)).toBe(ids[0])
  await expect(page.getByRole('link', { name: versions[0].taskId! }).first()).toHaveAttribute('href', /\/workbench\/.*\?taskId=/)
  await page.screenshot({ path: resolve(evidence, 'T1-version-switch.png'), fullPage: true })
})

test('D11-B-T2: empty, list failure, source failure and retry are distinct', async ({ page }) => {
  const state = await installVersionsFixture(page)
  state.records = []
  await openWorkbench(page)
  await expect(page.getByText('暂无版本记录。完成生成后可在此查看。')).toBeVisible()
  state.listStatus = 500
  await page.getByRole('button', { name: '刷新版本', exact: true }).click()
  await expect(page.locator('.versions-panel [role="alert"]')).toBeVisible()
  await expect(page.getByText('暂无版本记录。完成生成后可在此查看。')).toHaveCount(0)
  state.listStatus = 200; state.records = versions; state.sourceStatus = 404
  await page.getByRole('button', { name: '刷新版本', exact: true }).click()
  await expect(page.locator('.source-panel [role="alert"]')).toContainText('暂无可读取源码快照')
  await page.screenshot({ path: resolve(evidence, 'T2-source-error.png'), fullPage: true })
  state.sourceStatus = 200
  await page.getByRole('button', { name: '重试读取源码' }).click()
  await expect(page.getByLabel('文件内容')).toContainText('版本 2 页面')
})

test('D11-B-T3: draft and failed versions never replace available preview', async ({ page }) => {
  const state = await installVersionsFixture(page)
  await openWorkbench(page)
  await expect(page.frameLocator('iframe').getByRole('heading', { name: '版本 2 页面' })).toBeVisible()
  for (const index of [2, 3]) {
    const row = page.locator(`[data-version-id="${ids[index]}"]`)
    await expect(row).toContainText('此版本不可预览')
    await row.getByRole('button', { name: '查看源码', exact: true }).click()
    await expect(page.getByLabel('文件内容')).toContainText(`版本 ${index + 1} 页面`)
    await expect(page.frameLocator('iframe').getByRole('heading', { name: '版本 2 页面' })).toBeVisible()
    await expect(page.locator('.preview-panel__controls')).toContainText(ids[1])
  }
  expect(state.credentialIds).toEqual([ids[1]])
  await expect(page.locator(`[data-version-id="${ids[3]}"]`)).toContainText('构建退出码 2：缺少组件')
  await page.screenshot({ path: resolve(evidence, 'T3-failed-keeps-preview.png'), fullPage: true })
})

test('D11-B-T4: source script and HTML remain literal text', async ({ page }) => {
  await installVersionsFixture(page); await openWorkbench(page)
  await page.getByLabel('当前文件', { exact: true }).selectOption('src/untrusted.txt')
  await expect(page.getByLabel('文件内容')).toHaveText(malicious)
  expect(await page.evaluate(() => '__sourceExecuted' in window)).toBe(false)
  await expect(page.locator('.source-panel script, .source-panel img')).toHaveCount(0)
  await page.screenshot({ path: resolve(evidence, 'T4-script-as-text.png'), fullPage: true })
})

test('unknown status, missing verified build and wrong app metadata fail closed', async ({ page }) => {
  const state = await installVersionsFixture(page)
  state.records = [{ ...versions[0], status: 'UNKNOWN' as typeof versions[0]['status'] }]
  await openWorkbench(page)
  await expect(page.locator('.versions-panel [role="alert"]')).toContainText('无法确认验证状态')
  for (const invalid of [{ ...versions[0], buildId: null }, { ...versions[0], applicationId: ids[3] }]) {
    state.records = [invalid]
    await page.getByRole('button', { name: '刷新版本', exact: true }).click()
    await expect(page.locator('.versions-panel [role="alert"]')).toContainText('无法确认验证状态')
    await expect(page.locator('[data-version-id]')).toHaveCount(0)
  }
  expect(state.credentialIds).toEqual([ids[1]])
})

test('snapshot mismatch never displays the wrong source', async ({ page }) => {
  const state = await installVersionsFixture(page); state.mismatch = true
  await openWorkbench(page)
  await expect(page.locator('.source-panel [role="alert"]')).toContainText('不匹配')
  await expect(page.getByLabel('文件内容')).toHaveCount(0)
})

test('late source from prior selection cannot overwrite the new version', async ({ page }) => {
  await installVersionsFixture(page)
  let release!: () => void
  let started!: () => void
  const requested = new Promise<void>(resolve => { started = resolve })
  const delayed = new Promise<void>(resolve => { release = resolve })
  await page.route(`**/api/v0/versions/${ids[1]}/source`, async route => {
    started(); await delayed
    await route.fulfill({ json: { versionId: ids[1], sourceDigest: versions[1].sourceDigest, files: [{ path: 'old.txt', content: '迟到的旧源码' }] } }).catch(() => {})
  })
  await openWorkbench(page); await requested
  await page.locator(`[data-version-id="${ids[0]}"]`).getByRole('button').click()
  await expect(page.getByLabel('文件内容')).toContainText('版本 1 页面')
  release()
  await expect(page.getByLabel('文件内容')).not.toContainText('迟到的旧源码')
})

test('source 401 redirects to login and paginated versions keep selected preview', async ({ page }) => {
  const state = await installVersionsFixture(page)
  state.records = Array.from({ length: 21 }, (_, index) => ({ ...versions[0], id: `bbbbbbbb-bbbb-4bbb-8bbb-${String(index).padStart(12, '0')}`, number: index + 5 }))
  await openWorkbench(page)
  await expect(page.locator('[data-version-id]')).toHaveCount(20)
  await page.getByRole('button', { name: '下一页' }).click()
  await expect(page.locator('[data-version-id]')).toHaveCount(1)
  await expect(page.locator('.versions-panel')).toContainText('第 2 页')
  await expect(page.locator('.preview-panel__controls')).toContainText(ids[1])
  await page.route('**/api/v0/auth/me', route => route.fulfill({ status: 401 }))
  await page.route('**/api/v0/versions/*/source', route => route.fulfill({ status: 401 }))
  await page.locator('[data-version-id]').getByRole('button').click()
  await expect(page).toHaveURL(/\/login/)
})
