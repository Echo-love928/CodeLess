import { type Page, type Route } from '@playwright/test'
import { installMockApplicationsApi } from '../apps/mock-applications-api'
import { wireCancel, wireMetrics } from './wire-fixture'

// Explicit D17-A wire-contract fixture. Real integration has a separate harness.
export const owner = '77777777-7777-4777-8777-777777777777'
export const adminId = '99999999-9999-4999-8999-999999999999'
export const appId = '88888888-8888-4888-8888-888888888888'
export const taskId = (n: number) => `11111111-1111-4111-8111-${String(n).padStart(12, '0')}`
export async function installAdminAuth(page: Page) {
  let user: { id: string; role: string; displayName: string; email: string } | null = null
  await page.route('**/api/v0/auth/**', async route => {
    const path = new URL(route.request().url()).pathname
    const json = (body: unknown, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })
    if (path.endsWith('/csrf')) return json({ token: 'test-csrf-token' })
    if (path.endsWith('/me')) return json(user ?? {}, user ? 200 : 401)
    if (path.endsWith('/login')) {
      const body = route.request().postDataJSON()
      const admin = body.email === 'admin@codeless.local' && body.password === 'admin-password'
      if (!admin && !(body.email === 'demo@codeless.local' && body.password === 'good-password')) return json({}, 401)
      user = { id: admin ? adminId : owner, role: admin ? 'ADMIN' : 'USER', displayName: admin ? '管理员' : '演示用户', email: body.email }
      return json(user)
    }
    if (path.endsWith('/logout')) { user = null; return route.fulfill({ status: 204 }) }
    return json({}, 404)
  })
  await installMockApplicationsApi(page, () => user?.id)
}
export async function installAdminFixture(page: Page, options: { empty?: boolean; unknown?: boolean; cancel?: 'fail' | 'unknown' | 'cancelled'; permission?: number; metricsFailure?: boolean } = {}) {
  const requests: URL[] = [], mutations: { path: string; body: unknown; csrf: string | undefined }[] = []
  let revoked = false
  const json = (route: Route, body: unknown, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })
  await page.route('**/api/v0/admin/**', async route => {
    const url = new URL(route.request().url()), path = url.pathname, request = route.request()
    requests.push(url)
    if (revoked) return json(route, { code: 'FORBIDDEN' }, 403)
    if (path.endsWith('/session')) return json(route, { id: adminId, role: 'ADMIN' }, options.permission ?? 200)
    if (path.endsWith('/cancel')) {
      mutations.push({ path, body: request.postDataJSON(), csrf: request.headers()['x-csrf-token'] })
      if (options.cancel === 'fail') return json(route, { code: 'CONFLICT' }, 409)
      return json(route, wireCancel(path.split('/').at(-2)!, adminId, taskId(999), options.cancel === 'unknown' ? 'UNKNOWN' : 'CANCELLED'))
    }
    if (path.endsWith('/metrics')) {
      if (options.metricsFailure) return json(route, { code: 'UNAVAILABLE' }, 503)
      return json(route, wireMetrics({ empty: options.empty || options.unknown, from: url.searchParams.get('from'), to: url.searchParams.get('to') }))
    }
    const resource = path.split('/').at(-1)
    const common = { ownerId: owner, applicationId: appId, createdAt: '2026-10-20T04:00:00Z' }
    let rows = resource === 'tasks' ? Array.from({ length: 25 }, (_, i) => ({ ...common, id: taskId(25 - i), status: i % 2 === 0 ? 'GENERATE' : 'FAILED', cancellable: i % 2 === 0 })) :
      resource === 'applications' ? [{ ...common, id: appId, name: '<img src=x onerror=alert(1)>', status: 'ACTIVE' }] :
      resource === 'deployments' ? [{ ...common, id: taskId(101), versionId: taskId(102), status: 'PUBLISHED' }] :
      resource === 'users' ? [{ ...common, id: owner, displayName: 'Fixture user', email: 'fixture@example.test', role: 'USER', status: 'ACTIVE' }] :
      resource === 'audit' ? [] :
      [{ ...common, id: taskId(201), taskId: taskId(25), model: 'deterministic-mock', status: 'FUTURE_STATE', usage: 'UNKNOWN', inputTokens: null, outputTokens: 0 }]
    if (options.empty) rows = []
    const status = url.searchParams.get('status'), selectedOwner = url.searchParams.get('ownerId'), from = url.searchParams.get('from'), to = url.searchParams.get('to')
    rows = rows.filter(row => (!status || ('status' in row && row.status === status)) && (!selectedOwner || row.ownerId === selectedOwner)
      && (!from || Date.parse(row.createdAt) >= Date.parse(from)) && (!to || Date.parse(row.createdAt) < Date.parse(to)))
    const pageIndex = Number(url.searchParams.get('page')), size = Number(url.searchParams.get('size'))
    return json(route, { items: rows.slice(pageIndex * size, (pageIndex + 1) * size), totalItems: rows.length, totalPages: Math.ceil(rows.length / size), page: pageIndex, size })
  })
  return { requests, mutations, revoke: () => { revoked = true } }
}

export async function loginAdmin(page: Page) {
  await page.goto('/login')
  await page.getByLabel('邮箱').fill('admin@codeless.local'); await page.getByLabel('密码').fill('admin-password')
  await page.getByRole('button', { name: '登录', exact: true }).click()
  await page.waitForURL('**/apps'); await page.goto('/admin')
}
