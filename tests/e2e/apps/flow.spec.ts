import { expect, test } from '@playwright/test'
import { installMockAuth, loginAsDemo } from '../auth/mock-auth'

test('D04-B-T1 contract fixture: authenticated create opens its own workbench', async ({ page }) => {
  const auth = await installMockAuth(page)
  await loginAsDemo(page)
  await page.getByRole('button', { name: '新建应用' }).click()
  await page.getByLabel('应用名称').fill('我的活动页')
  await page.getByRole('dialog').getByRole('button', { name: '创建' }).click()
  await expect(page).toHaveURL(/\/workbench\/00000000-0000-4000-8000-000000000001$/)
  await expect(page.locator('.workbench-header__name')).toContainText('我的活动页')
  await expect(page.getByText('暂无可预览版本')).toBeVisible()
  expect(auth.getCreateCount()).toBe(1)
})

test('D04-B-T2 contract fixture: another user cannot open the application', async ({ page }) => {
  await installMockAuth(page)
  await loginAsDemo(page)
  await page.getByRole('button', { name: '退出' }).click()
  await page.getByLabel('邮箱').fill('admin@codeless.local')
  await page.getByLabel('密码').fill('admin-password')
  await page.getByRole('button', { name: '登录' }).click()
  await page.goto('/workbench/11111111-1111-4111-8111-111111111111')
  await expect(page.getByRole('alert')).toContainText('应用不存在或你无权访问')
  await expect(page.getByLabel('需求描述')).toHaveCount(0)
})

test('D04-B-T3 contract fixture: empty list and list failure stay distinct', async ({ page }) => {
  await installMockAuth(page)
  await page.goto('/login')
  await page.getByLabel('邮箱').fill('admin@codeless.local')
  await page.getByLabel('密码').fill('admin-password')
  await page.getByRole('button', { name: '登录' }).click()
  await expect(page.getByText('还没有应用')).toBeVisible()
  await page.route('**/api/v0/applications?*', route => route.abort())
  await page.reload()
  await expect(page.getByRole('alert')).toContainText('网络连接失败')
  await expect(page.getByText('还没有应用')).toHaveCount(0)
  await page.unroute('**/api/v0/applications?*')
  await page.getByRole('button', { name: '重试' }).click()
  await expect(page.getByText('还没有应用')).toBeVisible()
})

test('D04-B-T3 contract fixture: repeat submit sends one create request', async ({ page }) => {
  const auth = await installMockAuth(page)
  await loginAsDemo(page)
  let requests = 0
  await page.route('**/api/v0/applications', async route => {
    if (route.request().method() === 'POST') {
      requests += 1
      await new Promise(resolve => setTimeout(resolve, 350))
    }
    await route.fallback()
  })
  await page.getByRole('button', { name: '新建应用' }).click()
  await page.getByLabel('应用名称').fill('只创建一次')
  await page.getByRole('dialog').getByRole('button', { name: '创建' }).click()
  await expect(page.getByRole('dialog').getByRole('button', { name: '创建中…' })).toBeDisabled()
  await expect(page).toHaveURL(/\/workbench\/00000000-0000-4000-8000-000000000001$/)
  expect(requests).toBe(1)
  expect(auth.getCreateCount()).toBe(1)
})
