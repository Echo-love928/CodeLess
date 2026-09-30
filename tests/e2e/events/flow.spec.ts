import { expect, test } from '@playwright/test'
import { installMockAuth, loginAsDemo } from '../auth/mock-auth'
import { installTaskFixture } from './fixture'

async function workbench(page: Parameters<typeof installTaskFixture>[0]) {
  await installMockAuth(page)
  const fixture = await installTaskFixture(page)
  await loginAsDemo(page)
  await page.goto(`/workbench/${fixture.appId}`)
  await page.getByLabel('需求描述').fill('生成活动日程页面')
  await page.getByRole('button', { name: '开始生成', exact: true }).click()
  await expect(page.locator('[data-sequence="1"]')).toHaveCount(1)
  return fixture
}

test('D06-B-T1 fixture: offline reconnect backfills missing events once with exclusive cursor', async ({ page, context }) => {
  const fixture = await workbench(page)
  await expect.poll(() => fixture.counts().streams).toBeGreaterThan(0)
  fixture.setOffline(true)
  await context.setOffline(true)
  fixture.advance('GENERATE')
  fixture.advance('VERIFY', 'TOOL_RESULT', 'Tool result recorded: VERIFY')
  await expect(page.getByText(/连接中断，正在恢复/)).toBeVisible()
  await context.setOffline(false)
  fixture.setOffline(false)
  await expect(page.locator('[data-sequence="3"]')).toHaveCount(1)
  await expect(page.locator('.task-status')).toContainText('正在验证')
  await expect.poll(() => fixture.counts().cursors.includes('3')).toBe(true)
  await expect(page.locator('[data-sequence]')).toHaveCount(3)
  await page.screenshot({ path: '../../.local-data/d06-b/t1-recovered.png', fullPage: true })
})

test('D06-B-T2 fixture: reload and close/reopen recover the current task with full history', async ({ page, context }) => {
  const fixture = await workbench(page)
  fixture.advance('GENERATE')
  await expect(page.locator('[data-sequence="2"]')).toHaveCount(1)
  await page.reload()
  await expect(page.locator('.task-status')).toContainText('正在生成')
  await expect(page.locator('[data-sequence]')).toHaveCount(2)
  await expect(page.getByLabel('需求描述')).toHaveValue('生成活动日程页面')
  // Close the original tab; localStorage survives in this browser context.
  const reopened = await context.newPage()
  const origin = new URL(page.url()).origin
  await page.close()
  await installMockAuth(reopened)
  const second = await installTaskFixture(reopened)
  second.advance('GENERATE')
  await loginAsDemo(reopened)
  await reopened.goto(`${origin}/workbench/${fixture.appId}`)
  await expect(reopened.locator('.task-status')).toContainText('正在生成')
  await expect(reopened.locator('[data-sequence]')).toHaveCount(2)
  expect(second.counts().creates).toBe(0)
})

test('D06-B-T3 fixture: pending cancellation cannot claim cancelled or permit retry', async ({ page }) => {
  const fixture = await workbench(page)
  fixture.delayCancel()
  await page.getByRole('button', { name: '取消任务', exact: true }).click()
  await expect(page.getByRole('button', { name: '正在请求取消…' })).toBeDisabled()
  await expect(page.locator('.task-status')).not.toContainText('任务已取消')
  await expect(page.getByRole('button', { name: '开始生成', exact: true })).toBeDisabled()
  fixture.finishCancel()
  await expect(page.locator('.task-status')).toContainText('任务已取消')
  await expect(page.locator('[data-sequence="2"]')).toHaveCount(1)
  await expect(page.getByRole('button', { name: '重试生成' })).toBeEnabled()
  const finished = fixture.counts().streams
  await page.waitForTimeout(2100)
  expect(fixture.counts().streams).toBe(finished)
  await page.getByRole('button', { name: '重试生成' }).click()
  await expect(page.locator('.task-status')).toContainText('正在规划')
  expect(fixture.counts().creates).toBe(2)
  expect(fixture.counts().cancels).toBe(1)
})

test('D06-B-T4 fixture: unknown events render inert diagnostics and do not crash the page', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  const fixture = await workbench(page)
  fixture.unknown()
  await expect(page.getByText('未知事件（FUTURE_EVENT），保留诊断信息。')).toBeVisible()
  await expect(page.locator('.task-status')).toContainText('正在规划')
  await expect(page.getByText('<script>untrusted</script>')).toBeVisible()
  expect(errors).toEqual([])
  await expect(page.getByRole('button', { name: '取消任务', exact: true })).toBeEnabled()
})

test('fixture: task 401 expires the session; task 404 blocks creation without claiming success', async ({ page }) => {
  const fixture = await workbench(page)
  await page.route('**/api/v0/tasks/*', route => route.fulfill({ status: 404 }))
  await page.reload()
  await expect(page.getByRole('alert')).toContainText('任务不存在或你无权访问')
  await expect(page.getByRole('button', { name: '开始生成', exact: true })).toBeDisabled()
  await page.route('**/api/v0/tasks/*', route => route.fulfill({ status: 401 }))
  await page.reload()
  await expect(page).toHaveURL(/\/login\?redirect=/)
  expect(fixture.counts().creates).toBe(1)
})
