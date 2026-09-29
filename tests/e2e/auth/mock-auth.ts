import { expect, type Page } from '@playwright/test'
import { installMockApplicationsApi } from '../apps/mock-applications-api'

// TEST DOUBLE ONLY. Mirrors D03-A contracts/auth/README.md; no API server is started.
export async function installMockAuth(page: Page) {
  let user: { id: string; email: string; displayName: string; role: 'USER' | 'ADMIN' } | null = null
  let sessionChecks = 0
  await page.route('**/api/v0/auth/**', async route => {
    const request = route.request()
    const path = new URL(request.url()).pathname
    if (path.endsWith('/csrf') && request.method() === 'GET') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: '{"token":"test-csrf-token"}' })
    }
    if (path.endsWith('/me') && request.method() === 'GET') {
      sessionChecks += 1
      return route.fulfill({ status: user ? 200 : 401, contentType: 'application/json', body: JSON.stringify(user ?? { code: 'UNAUTHENTICATED' }) })
    }
    if (path.endsWith('/login') && request.method() === 'POST') {
      if (request.headers()['x-csrf-token'] !== 'test-csrf-token') return route.fulfill({ status: 403 })
      const body = request.postDataJSON() as { email: string; password: string }
      if (body.email === 'demo@codeless.local' && body.password === 'good-password') user = { id: 'user-1', email: body.email, displayName: '演示用户', role: 'USER' }
      else if (body.email === 'admin@codeless.local' && body.password === 'admin-password') user = { id: 'user-2', email: body.email, displayName: '管理员', role: 'ADMIN' }
      else return route.fulfill({ status: 401, contentType: 'application/json', body: '{"code":"UNAUTHORIZED"}' })
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(user) })
    }
    if (path.endsWith('/logout') && request.method() === 'POST') {
      if (!user) return route.fulfill({ status: 401 })
      if (request.headers()['x-csrf-token'] !== 'test-csrf-token') return route.fulfill({ status: 403 })
      user = null
      return route.fulfill({ status: 204 })
    }
    return route.fulfill({ status: 404 })
  })
  const applications = await installMockApplicationsApi(page, () => user?.id)
  return { getSessionChecks: () => sessionChecks, ...applications }
}

export async function loginAsDemo(page: Page) {
  await page.goto('/login')
  await page.getByLabel('邮箱').fill('demo@codeless.local')
  await page.getByLabel('密码').fill('good-password')
  await page.getByRole('button', { name: '登录' }).click()
  await expect(page).toHaveURL(/\/apps$/)
}
