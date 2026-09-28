import { expect, test } from '@playwright/test'

const demoPassword = process.env.CODELESS_DEMO_PASSWORD!
const adminPassword = process.env.CODELESS_ADMIN_PASSWORD!

async function submitLogin(page: import('@playwright/test').Page, email: string, password: string) {
  await page.getByLabel('邮箱').fill(email)
  await page.getByLabel('密码').fill(password)
  await page.getByRole('button', { name: '登录' }).click()
}

test('real demo account: CSRF JSON, failed retry, redirect, refresh and logout', async ({ page, context }) => {
  const csrf = await page.request.get('/api/v0/auth/csrf')
  expect(csrf.status()).toBe(200)
  expect(csrf.headers()['content-type']).toContain('application/json')
  expect((await csrf.json()).token).toBeTruthy()

  await page.goto('/workbench/demo')
  await expect(page).toHaveURL(/\/login\?redirect=/)
  await expect(page.getByRole('status')).toContainText('请先登录')

  await submitLogin(page, 'demo@codeless.local', `${demoPassword}-wrong`)
  await expect(page.getByRole('alert')).toHaveText('账号或密码不正确，请重试。')
  await expect(page.getByRole('button', { name: '登录' })).toBeEnabled()
  await submitLogin(page, 'demo@codeless.local', demoPassword)
  await expect(page).toHaveURL(/\/workbench\/demo$/)

  const cookies = await context.cookies()
  expect(cookies).toEqual(expect.arrayContaining([
    expect.objectContaining({ name: 'JSESSIONID', httpOnly: true, sameSite: 'Lax', secure: false }),
  ]))
  await page.reload()
  await expect(page.getByRole('heading', { name: '选中一处，调整一点。' })).toBeVisible()
  const me = await page.request.get('/api/v0/auth/me')
  expect(me.status()).toBe(200)
  expect((await me.json()).email).toBe('demo@codeless.local')

  await page.goto('/apps')
  await expect(page.getByText('应用接口：测试替身')).toBeVisible()
  await page.getByRole('button', { name: '退出' }).click()
  await expect(page).toHaveURL(/\/login$/)
  expect((await page.request.get('/api/v0/auth/me')).status()).toBe(401)
  await page.goto('/workbench/demo')
  await expect(page).toHaveURL(/\/login\?redirect=/)
})

test('real admin account signs in independently', async ({ page }) => {
  await page.goto('/login')
  await submitLogin(page, 'admin@codeless.local', adminPassword)
  await expect(page).toHaveURL(/\/apps$/)
  const me = await page.request.get('/api/v0/auth/me')
  expect(me.status()).toBe(200)
  expect(await me.json()).toEqual(expect.objectContaining({
    email: 'admin@codeless.local',
    role: 'ADMIN',
  }))
  await page.getByRole('button', { name: '退出' }).click()
  await expect(page).toHaveURL(/\/login$/)
  expect((await page.request.get('/api/v0/auth/me')).status()).toBe(401)
})
