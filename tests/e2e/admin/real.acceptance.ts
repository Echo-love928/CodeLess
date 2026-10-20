import { expect, test, type Page } from '@playwright/test'
import { mkdir, rename, unlink, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'

// Real transport only. No page.route, mocked auth, API fixtures or test server controllers.
const task = (n: number) => `11111111-1111-4111-8111-${String(n).padStart(12, '0')}`
const app = '88888888-8888-4888-8888-888888888888'
const output = process.env.CODELESS_ADMIN_LIVE_OUTPUT!
async function login(page: Page, admin = true) {
  await page.goto('/login')
  await page.getByLabel('邮箱').fill(admin ? 'admin@codeless.local' : 'demo@codeless.local')
  await page.getByLabel('密码').fill(admin ? 'fixture-admin-only-d17' : 'fixture-demo-only-d17')
  await page.getByRole('button', { name: '登录', exact: true }).click(); await expect(page).toHaveURL(/\/apps$/)
  await page.goto('/admin')
}
test('real T1: ordinary browser and direct management reads/writes are denied', async ({ page }) => {
  await login(page, false); await expect(page).toHaveURL(/\/apps\?reason=admin-required$/)
  expect((await page.request.get('/api/v0/admin/tasks')).status()).toBe(403)
  expect((await page.request.get('/api/v0/%61dmin/users')).status()).toBe(403)
  const csrf = await (await page.request.get('/api/v0/auth/csrf')).json()
  expect((await page.request.post(`/api/v0/admin/tasks/${task(25)}/cancel`, { data: { reason: 'ordinary attempt' }, headers: { 'X-CSRF-Token': csrf.token } })).status()).toBe(403)
})
test('real T2/T3: metrics match SQL records, pagination and supported filters; all six resources render', async ({ page }) => {
  await login(page)
  await expect(page.getByText('共 25 条 · 第 1 页')).toBeVisible()
  await expect(page.getByText('33.3%', { exact: true })).toHaveCount(2) // generation 1/3; deployment 1/3
  await expect(page.getByText('输入 未知 / 输出 未知 tokens')).toBeVisible()
  await expect(page.getByText('已知调用用量下限：≥ 150 tokens')).toBeVisible()
  const metrics = await (await page.request.get('/api/v0/admin/metrics')).json()
  expect(metrics.generation).toMatchObject({ ready: 1, failed: 2, cancelled: 1, denominator: 3, successRate: 0.3333 })
  expect(metrics.tokens).toMatchObject({ complete: false, knownCalls: 2, unknownCalls: 2, pendingCalls: 1, totalTokens: null })
  await page.getByRole('button', { name: '下一页', exact: true }).click()
  await expect(page.getByText('共 25 条 · 第 2 页')).toBeVisible()
  await expect(page.getByRole('rowheader', { name: task(5), exact: true })).toBeVisible()
  await page.getByLabel('任务结果', { exact: true }).selectOption('FAILED')
  await page.getByRole('button', { name: '应用筛选', exact: true }).click()
  await expect(page.getByText('共 2 条 · 第 1 页')).toBeVisible()
  await expect(page.getByRole('rowheader', { name: task(3), exact: true })).toHaveCount(0)
  for (const [tab, text] of [['应用', '真实后台联调应用'], ['部署', '成功 · PUBLISHED'], ['用户', 'admin@codeless.local'], ['模型调用', 'fixture-records-no-model-invocation']]) {
    await page.getByRole('button', { name: tab, exact: true }).click()
    await expect(page.getByRole('cell', { name: text, exact: true }).first()).toBeVisible()
  }
  await page.getByLabel('用量状态').selectOption('UNKNOWN'); await page.getByRole('button', { name: '应用筛选', exact: true }).click()
  await expect(page.getByText('共 2 条 · 第 1 页')).toBeVisible()
  await page.getByRole('button', { name: '取消审计', exact: true }).click(); await expect(page.getByText('当前筛选下没有记录')).toBeVisible()
  await page.getByText('生成任务每日趋势（UTC）', { exact: true }).click()
  await expect(page.getByText('成功 1 / 失败 2 / 进行中 21 / 取消 1')).toBeVisible()
  await writeFile(join(output, 'real-metrics.json'), JSON.stringify(metrics, null, 2))
})
test('real T4: unavailable audit rejects cancellation and keeps the real table readable', async ({ page }) => {
  await login(page)
  const audit = resolve(output, 'audit'), backup = resolve(output, 'audit-backup')
  await mkdir(audit, { recursive: true }); await rename(audit, backup)
  try {
    await writeFile(audit, 'controlled audit outage')
    await page.getByRole('button', { name: `取消任务 ${task(24)}`, exact: true }).click()
    await page.getByLabel('取消理由（1–200 字）').fill('真实审计故障测试')
    const response = page.waitForResponse(r => r.url().endsWith(`/tasks/${task(24)}/cancel`))
    await page.getByRole('button', { name: '确认取消', exact: true }).click()
    expect((await response).status()).toBe(503)
    await expect(page.getByRole('alert')).toContainText('未取消')
    await expect(page.getByRole('alert')).toContainText('任务未被改动')
    await expect(page.getByRole('button', { name: `取消任务 ${task(24)}`, exact: true })).toBeEnabled()
    await expect(page.getByRole('rowheader', { name: task(24), exact: true })).toBeVisible()
    const rows = await (await page.request.get('/api/v0/admin/tasks?status=GENERATE')).json()
    expect(rows.items.find((row: { id: string }) => row.id === task(24))).toMatchObject({ status: 'GENERATE', cancellable: true })
    await page.screenshot({ path: join(output, 'real-cancel-failure.png'), fullPage: true })
  } finally { await unlink(audit); await rename(backup, audit) }
})
test('real cancellation binds actor, target and redacted reason; duplicate cancel adds no task event', async ({ page }) => {
  await login(page)
  const me = await (await page.request.get('/api/v0/auth/me')).json()
  await page.getByRole('button', { name: `取消任务 ${task(25)}`, exact: true }).click()
  await expect(page.getByRole('dialog')).toContainText(app)
  await page.getByLabel('取消理由（1–200 字）').fill('管理员联调停止 api_key=sk-live-fixture-secret-for-audit')
  const response = page.waitForResponse(r => r.url().endsWith(`/tasks/${task(25)}/cancel`))
  await page.getByRole('button', { name: '确认取消', exact: true }).click()
  const reply = await response; expect(reply.status()).toBe(200)
  const result = await reply.json()
  expect(result.task).toMatchObject({ id: task(25), status: 'FAILED', failureCode: 'CANCELLED', cancellable: false })
  expect(result.audit).toMatchObject({ actorId: me.id, targetId: task(25), outcome: 'CANCELLED', previousStatus: 'GENERATE', resultingStatus: 'FAILED' })
  expect(result.audit.reason).toContain('管理员联调停止'); expect(JSON.stringify(result)).not.toContain('sk-live-fixture-secret-for-audit')
  await expect(page.getByRole('status')).toContainText('服务端确认已取消')
  await expect(page.getByRole('row', { name: new RegExp(task(25)) })).toContainText('已取消 · FAILED / CANCELLED')
  await page.getByRole('button', { name: '取消审计', exact: true }).click()
  await page.getByLabel('审计目标 ID').fill(task(25)); await page.getByRole('button', { name: '应用筛选', exact: true }).click()
  await expect(page.getByRole('rowheader', { name: result.audit.id, exact: true })).toBeVisible()
  await expect(page.getByRole('cell', { name: me.id, exact: true })).toBeVisible()
  const csrf = await (await page.request.get('/api/v0/auth/csrf')).json()
  const repeated = await page.request.post(`/api/v0/admin/tasks/${task(25)}/cancel`, { data: { reason: '显式复核重复请求' }, headers: { 'X-CSRF-Token': csrf.token } })
  expect(repeated.status()).toBe(200); expect((await repeated.json()).audit.outcome).toBe('ALREADY_TERMINAL')
  await writeFile(join(output, 'real-cancellation.json'), JSON.stringify(result, null, 2))
  await page.screenshot({ path: join(output, 'real-audit.png'), fullPage: true })
})
test('real empty window has null rates and no fake zero success', async ({ page }) => {
  await login(page)
  await page.getByLabel('开始时间（本地，含）').fill('2026-10-21T00:00')
  await page.getByLabel('结束时间（本地，不含）').fill('2026-10-22T00:00')
  await page.getByRole('button', { name: '应用筛选', exact: true }).click()
  await expect(page.getByText('暂无已知终态', { exact: true })).toHaveCount(2)
  await expect(page.getByText('当前筛选下没有记录')).toBeVisible()
  await expect(page.getByText('0.0%', { exact: true })).toHaveCount(0)
})
