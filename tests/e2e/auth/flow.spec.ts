import { expect, test } from '@playwright/test'
import { installMockAuth, loginAsDemo } from './mock-auth'

test('D03-B-T1: failed login explains error and allows retry (auth contract mock)', async ({ page }) => {
  await installMockAuth(page)
  await page.goto('/login')
  await page.getByLabel('邮箱').fill('demo@codeless.local')
  await page.getByLabel('密码').fill('wrong-password')
  await page.getByRole('button', { name: '登录' }).click()
  await expect(page.getByRole('alert')).toHaveText('账号或密码不正确，请重试。')
  await expect(page.getByRole('button', { name: '登录' })).toBeEnabled()
  await page.getByLabel('密码').fill('good-password')
  await page.getByRole('button', { name: '登录' }).click()
  await expect(page).toHaveURL(/\/apps$/)
})

test('D03-B-T2: refresh restores a session from the auth endpoint (auth contract mock)', async ({ page }) => {
  const auth = await installMockAuth(page)
  await loginAsDemo(page)
  await expect(page).toHaveURL(/\/apps$/)
  const checksBefore = auth.getSessionChecks()
  await page.reload()
  await expect(page.getByRole('heading', { name: '我的应用' })).toBeVisible()
  expect(auth.getSessionChecks()).toBeGreaterThan(checksBefore)
})

test('D03-B-T3: anonymous workbench visit redirects to login and returns after login', async ({ page }) => {
  await installMockAuth(page)
  await page.goto('/workbench/demo')
  await expect(page).toHaveURL(/\/login\?redirect=/)
  await expect(page.getByRole('status')).toContainText('请先登录')
  await page.getByLabel('邮箱').fill('demo@codeless.local')
  await page.getByLabel('密码').fill('good-password')
  await page.getByRole('button', { name: '登录' }).click()
  await expect(page).toHaveURL(/\/workbench\/demo$/)
})

test('logout invalidates the mocked session and protects workbench again', async ({ page }) => {
  await installMockAuth(page)
  await loginAsDemo(page)
  await page.getByRole('button', { name: '退出' }).click()
  await expect(page).toHaveURL(/\/login$/)
  await page.goto('/workbench/demo')
  await expect(page).toHaveURL(/\/login\?redirect=/)
})

test('application CRUD is explicitly a local test double, scoped per user', async ({ page }) => {
  await installMockAuth(page)
  await loginAsDemo(page)
  await expect(page.getByText('应用接口：测试替身')).toBeVisible()
  await page.getByRole('button', { name: '新建应用' }).click()
  await page.getByLabel('应用名称').fill('我的作品')
  await page.getByLabel('数据模式').selectOption('LOCAL_STORAGE')
  await page.getByRole('dialog').getByRole('button', { name: '创建' }).click()
  await expect(page.getByRole('heading', { name: '我的作品' })).toBeVisible()
  await page.reload()
  await expect(page.getByRole('heading', { name: '我的作品' })).toBeVisible()
  await page.getByRole('button', { name: '退出' }).click()
  await page.getByLabel('邮箱').fill('admin@codeless.local')
  await page.getByLabel('密码').fill('admin-password')
  await page.getByRole('button', { name: '登录' }).click()
  await expect(page.getByRole('heading', { name: '我的作品' })).toHaveCount(0)
})

test('network failure does not admit anonymous users', async ({ page }) => {
  await page.route('**/api/v0/auth/me', route => route.abort())
  await page.goto('/apps')
  await expect(page).toHaveURL(/\/login\?redirect=/)
  await expect(page.getByRole('status')).toContainText('认证服务暂时不可用')
})

test('403 and network errors keep login retryable', async ({ page }) => {
  await installMockAuth(page)
  await page.route('**/api/v0/auth/login', route => route.fulfill({ status: 403 }))
  await page.goto('/login')
  await page.getByLabel('邮箱').fill('demo@codeless.local')
  await page.getByLabel('密码').fill('good-password')
  await page.getByRole('button', { name: '登录' }).click()
  await expect(page.getByRole('alert')).toHaveText('你没有权限执行此操作。')
  await page.unroute('**/api/v0/auth/login')
  await page.route('**/api/v0/auth/login', route => route.abort())
  await page.getByRole('button', { name: '登录' }).click()
  await expect(page.getByRole('alert')).toHaveText('网络连接失败，请检查连接后重试。')
  await expect(page.getByRole('button', { name: '登录' })).toBeEnabled()
})

test('submitting login locks the form until the request settles', async ({ page }) => {
  await installMockAuth(page)
  await page.route('**/api/v0/auth/login', async route => {
    await new Promise(resolve => setTimeout(resolve, 350))
    await route.fulfill({ status: 401 })
  })
  await page.goto('/login')
  await page.getByLabel('邮箱').fill('demo@codeless.local')
  await page.getByLabel('密码').fill('wrong-password')
  await page.getByRole('button', { name: '登录' }).click()
  await expect(page.getByRole('button', { name: '正在登录…' })).toBeDisabled()
  await expect(page.getByRole('alert')).toHaveText('账号或密码不正确，请重试。')
  await expect(page.getByRole('button', { name: '登录' })).toBeEnabled()
})

test('a revoked session is rejected at the next protected navigation', async ({ page }) => {
  await installMockAuth(page)
  await loginAsDemo(page)
  await page.route('**/api/v0/auth/me', route => route.fulfill({ status: 401 }))
  await page.goto('/workbench/demo')
  await expect(page).toHaveURL(/\/login\?redirect=/)
  await expect(page.getByRole('status')).toContainText('请先登录')
})
