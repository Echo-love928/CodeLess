import { expect, test } from '@playwright/test'

const demoPassword = process.env.CODELESS_DEMO_PASSWORD!
const adminPassword = process.env.CODELESS_ADMIN_PASSWORD!

async function login(page: import('@playwright/test').Page, email: string, password: string) {
  await page.goto('/login')
  await page.getByLabel('邮箱').fill(email)
  await page.getByLabel('密码').fill(password)
  await page.getByRole('button', { name: '登录' }).click()
  await expect(page).toHaveURL(/\/apps$/)
}

test('D04-B-T1/T2: real login, create, workbench and cross-user denial', async ({ page }) => {
  await login(page, 'demo@codeless.local', demoPassword)
  await expect(page.getByText('还没有应用')).toBeVisible()

  await page.locator('.dashboard-heading').getByRole('button', { name: '新建应用' }).click()
  await page.getByLabel('应用名称').fill('真实联调活动页')
  await page.getByLabel('数据模式').selectOption('MOCK')
  await page.getByRole('dialog').getByRole('button', { name: '创建' }).click()
  await expect(page).toHaveURL(/\/workbench\/[0-9a-f-]{36}$/)
  const applicationId = new URL(page.url()).pathname.split('/').at(-1)!
  await expect(page.locator('.workbench-header__name')).toContainText('真实联调活动页')
  const detail = await page.request.get(`/api/v0/applications/${applicationId}`)
  expect(detail.status()).toBe(200)
  const application = await detail.json() as { baseVersionId: string; latestReadyVersionId?: string }
  expect(application.baseVersionId).toMatch(/^[0-9a-f-]{36}$/)
  expect(application.latestReadyVersionId).toBeUndefined()
  await expect(page.getByText(`初始草稿版本：${application.baseVersionId}`, { exact: false })).toBeVisible()
  await expect(page.getByText('暂无可预览版本')).toBeVisible()
  const version = await page.request.get(`/api/v0/versions/${application.baseVersionId}`)
  expect(version.status()).toBe(200)
  expect((await version.json()).status).toBe('DRAFT')

  await page.goto('/apps')
  await expect(page.getByRole('heading', { name: '真实联调活动页' })).toBeVisible()
  await page.getByRole('button', { name: '退出' }).click()
  await login(page, 'admin@codeless.local', adminPassword)
  await expect(page.getByText('还没有应用')).toBeVisible()
  await page.goto(`/workbench/${applicationId}`)
  await expect(page.getByRole('alert')).toContainText('应用不存在或你无权访问')
  await expect(page.getByLabel('需求描述')).toHaveCount(0)
  expect((await page.request.get(`/api/v0/applications/${applicationId}`)).status()).toBe(404)
})
