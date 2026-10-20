import { type Page, type Route } from '@playwright/test'

// Explicit D17-B PROPOSED API fixture. This does not start or validate D17-A.
export const owner = '77777777-7777-4777-8777-777777777777'
export const appId = '88888888-8888-4888-8888-888888888888'
export const taskId = (n: number) => `11111111-1111-4111-8111-${String(n).padStart(12, '0')}`
const outcomes = { succeeded: 0, failed: 0, pending: 0, cancelled: 0, unknown: 0 }
export async function installAdminFixture(page: Page, options: { empty?: boolean; unknown?: boolean; cancel?: 'fail' | 'requested' | 'cancelled'; permission?: number; metricsFailure?: boolean } = {}) {
  const requests: URL[] = [], mutations: { path: string; body: unknown; csrf: string | undefined }[] = []
  let revoked = false
  const json = (route: Route, body: unknown, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })
  await page.route('**/api/v0/admin/**', async route => {
    const url = new URL(route.request().url()), path = url.pathname, request = route.request()
    requests.push(url)
    if (revoked) return json(route, { code: 'FORBIDDEN' }, 403)
    if (path.endsWith('/session')) return json(route, { id: 'user-2', role: 'ADMIN' }, options.permission ?? 200)
    if (path.endsWith('/cancel')) {
      mutations.push({ path, body: request.postDataJSON(), csrf: request.headers()['x-csrf-token'] })
      if (options.cancel === 'fail') return json(route, { code: 'CONFLICT' }, 409)
      return json(route, { taskId: path.split('/').at(-2), status: options.cancel === 'cancelled' ? 'CANCELLED' : 'REQUESTED', auditId: taskId(999) })
    }
    if (path.endsWith('/metrics')) {
      if (options.metricsFailure) return json(route, { code: 'UNAVAILABLE' }, 503)
      return json(route, { generation: options.empty || options.unknown ? outcomes : { ...outcomes, succeeded: 3, failed: 1, unknown: 2 }, deployment: options.empty || options.unknown ? outcomes : { ...outcomes, succeeded: 1, failed: 3 },
        usage: { inputTokens: options.empty ? 0 : null, outputTokens: options.empty ? 0 : null, unknownCalls: options.empty ? 0 : 2 },
        trend: options.empty ? [] : [{ day: '2026-10-20', generation: options.unknown ? { ...outcomes, unknown: 2 } : { ...outcomes, succeeded: 3, failed: 1, unknown: 2 } }] })
    }
    const resource = path.split('/').at(-1)
    const common = { ownerId: owner, applicationId: appId, createdAt: '2026-10-20T04:00:00Z' }
    let rows = resource === 'tasks' ? Array.from({ length: 25 }, (_, i) => ({ ...common, id: taskId(25 - i), status: i % 2 === 0 ? 'GENERATE' : 'FAILED', cancellable: i % 2 === 0 })) :
      resource === 'applications' ? [{ ...common, id: appId, name: '<img src=x onerror=alert(1)>', status: 'ACTIVE' }] :
      resource === 'deployments' ? [{ ...common, id: taskId(101), versionId: taskId(102), status: 'PUBLISHED' }] :
      resource === 'users' ? [{ ...common, id: owner, name: 'Fixture user', email: 'fixture@example.test', role: 'USER' }] :
      [{ ...common, id: taskId(201), taskId: taskId(25), model: 'deterministic-mock', status: 'FUTURE_STATE', inputTokens: null, outputTokens: 0 }]
    if (options.empty) rows = []
    const status = url.searchParams.get('status'), selectedOwner = url.searchParams.get('ownerId'), from = url.searchParams.get('from'), to = url.searchParams.get('to')
    rows = rows.filter(row => (!status || ('status' in row && row.status === status)) && (!selectedOwner || row.ownerId === selectedOwner)
      && (!from || Date.parse(row.createdAt) >= Date.parse(from)) && (!to || Date.parse(row.createdAt) < Date.parse(to)))
    const pageIndex = Number(url.searchParams.get('page')), size = Number(url.searchParams.get('size'))
    return json(route, { items: rows.slice(pageIndex * size, (pageIndex + 1) * size), total: rows.length, page: pageIndex, size })
  })
  return { requests, mutations, revoke: () => { revoked = true } }
}

export async function loginAdmin(page: Page) {
  await page.goto('/login')
  await page.getByLabel('邮箱').fill('admin@codeless.local'); await page.getByLabel('密码').fill('admin-password')
  await page.getByRole('button', { name: '登录', exact: true }).click()
  await page.waitForURL('**/apps'); await page.goto('/admin')
}
