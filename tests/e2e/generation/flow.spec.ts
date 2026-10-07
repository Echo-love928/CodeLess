import { expect, test, type Page } from '@playwright/test'
import { spawn } from 'node:child_process'
import { readFile, mkdir } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { GenerationFixtureProvider, type FixtureResults } from './fixture-provider'
import { loginAsDemo } from '../auth/mock-auth'


const root = resolve(process.cwd(), '../..')
const runtime = join(root, '.local-data/d10-b/generation')
const evidence = join(root, 'docs/evidence/D10/deterministic')
let results: FixtureResults, assets: Record<string, string>

test.beforeAll(async () => {
  test.setTimeout(90000)
  await mkdir(evidence, { recursive: true })
  const env = { ...process.env }
  delete env.CODELESS_MODEL_API_KEY; delete env.CODELESS_MODEL_NAME
  const observed = await new Promise<{ code: number | null; log: string }>((done, reject) => {
    const child = spawn(process.execPath, ['tests/e2e/generation/prepare-fixture.mjs', runtime], { cwd: root, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
    let log = ''
    child.stdout.on('data', data => { log = (log + data).slice(-20000) })
    child.stderr.on('data', data => { log = (log + data).slice(-20000) })
    child.on('error', reject); child.on('close', code => done({ code, log }))
  })
  expect(observed.code, observed.log).toBe(0)
  results = JSON.parse(await readFile(join(runtime, 'manifest.json'), 'utf8'))
  assets = JSON.parse(await readFile(join(runtime, 'assets.json'), 'utf8'))
})

async function start(page: Page) {
  const provider = new GenerationFixtureProvider(results, assets)
  await provider.install(page)
  await loginAsDemo(page)
  await page.goto(`/workbench/${provider.appId}`)
  await expect(page.frameLocator('iframe').getByRole('heading', { name: '林予安，设计与摄影' })).toBeVisible()
  await page.getByLabel('需求描述').fill('生成个人展示页，保留作品列表')
  await page.getByRole('button', { name: '开始生成', exact: true }).click()
  await expect(page.locator('.task-status')).toContainText('正在规划')
  await expect(page.locator('[data-sequence="1"]')).toHaveCount(1)
  return provider
}

test('D10-B success fixture: missing component -> real failed build -> repair -> real verification -> preview', async ({ page }) => {
  const fixture = await start(page)
  fixture.advance('GENERATE'); fixture.advance('VERIFY'); fixture.recordFailedBuild(); fixture.advance('REPAIR')
  await expect(page.locator('.task-status')).toContainText('正在修复')
  await expect(page.locator('.task-status')).toContainText('第 1 次修复')
  await expect(page.locator(`[data-build-id="${results.failed.id}"]`)).toContainText('构建失败')
  await expect(page.locator('.task-status')).not.toContainText('生成完成')
  fixture.advance('GENERATE'); fixture.advance('VERIFY'); fixture.recordRepairedBuild(); fixture.ready()
  await expect(page.locator('.task-status')).toContainText('生成完成')
  await expect(page.getByText('已执行修复：1 / 3 轮', { exact: true })).toBeVisible()
  await expect(page.locator('iframe')).toHaveAttribute('src', new RegExp(fixture.newVersion.replaceAll('-', '')))
  await expect(page.frameLocator('iframe').getByRole('heading', { name: '林予安，设计与摄影' })).toBeVisible()
  await expect(page.locator(`[data-build-id="${results.repaired.id}"]`)).toContainText('退出码：0')
  await expect(page.getByText('本次任务需求：生成个人展示页，保留作品列表', { exact: true })).toBeVisible()
  await page.reload()
  await expect(page.locator('.task-status')).toContainText('生成完成')
  await expect(page.locator('[data-sequence]')).toHaveCount(fixture.history.length)
  expect(fixture.creates).toBe(1)
  await page.screenshot({ path: join(evidence, 'success.png'), fullPage: true })
})

test('D10-B failure fixture: model done + real build exit 0 + actual wrong page -> FAILED, keep old preview', async ({ page }) => {
  const fixture = await start(page)
  fixture.advance('GENERATE'); fixture.advance('VERIFY'); fixture.recordRepairedBuild(); fixture.claimComplete()
  await expect(page.getByText('模型声称生成完成', { exact: true }).first()).toBeVisible()
  await expect(page.locator('.task-status')).toContainText('正在验证')
  await expect(page.locator('.task-status')).not.toContainText('生成完成')
  fixture.fail()
  await expect(page.locator('.task-status')).toContainText('页面未通过浏览器验收')
  await expect(page.locator('.task-status')).toContainText('AGENT_ACTION_FAILED')
  await expect(page.locator('iframe')).toHaveAttribute('src', new RegExp(fixture.oldVersion.replaceAll('-', '')))
  await expect(page.getByText('本次生成失败。已有可用版本会继续保留。')).toBeVisible()
  await expect(page.getByRole('button', { name: '重试生成' })).toBeEnabled()
  fixture.detailsUnavailable = true
  await page.reload()
  await expect(page.locator('.workbench-task').getByRole('alert').last()).toContainText('缺失详情不能视为构建成功')
  await expect(page.locator('.task-status')).not.toContainText('生成完成')
  expect(fixture.currentVersion).toBe(fixture.oldVersion)
  await page.screenshot({ path: join(evidence, 'failure.png'), fullPage: true })
})

test('D10-B cancellation fixture: pending -> authoritative CANCELLED -> explicit new task', async ({ page }) => {
  const fixture = await start(page), original = fixture.task.id
  fixture.advance('GENERATE'); fixture.delayCancel()
  await page.getByRole('button', { name: '取消任务', exact: true }).click()
  await expect(page.getByRole('button', { name: '正在请求取消…' })).toBeDisabled()
  await expect(page.locator('.task-status')).not.toContainText('任务已取消')
  await expect(page.getByRole('button', { name: '开始生成', exact: true })).toBeDisabled()
  fixture.finishCancel()
  await expect(page.locator('.task-status')).toContainText('任务已取消')
  await expect(page.locator('.task-status')).toContainText('CANCELLED')
  await expect(page.locator('iframe')).toHaveAttribute('src', new RegExp(fixture.oldVersion.replaceAll('-', '')))
  await page.screenshot({ path: join(evidence, 'cancelled.png'), fullPage: true })
  await page.getByRole('button', { name: '重试生成' }).click()
  await expect(page.locator('.task-status')).toContainText('正在规划')
  expect(fixture.task.id).not.toBe(original); expect(fixture.creates).toBe(2); expect(fixture.cancels).toBe(1)
  expect(new Set(fixture.idempotencyKeys).size).toBe(2)
  await expect(page.locator('[data-sequence]')).toHaveCount(1)
})

test('D10-B recovery fixture: offline backfill -> reload -> close/reopen, no duplicate POST or events', async ({ page, context }) => {
  const fixture = await start(page), original = fixture.task.id
  await expect.poll(() => fixture.streams).toBeGreaterThan(0)
  fixture.offline = true; await context.setOffline(true)
  fixture.advance('GENERATE'); fixture.advance('VERIFY'); fixture.recordFailedBuild(); fixture.advance('REPAIR')
  await expect(page.getByText(/连接中断，正在恢复/)).toBeVisible()
  await context.setOffline(false); fixture.offline = false
  await expect(page.locator('.task-status')).toContainText('正在修复')
  await expect(page.locator('[data-sequence]')).toHaveCount(fixture.history.length)
  await expect.poll(() => fixture.cursors.includes(String(fixture.history.length))).toBe(true)
  await page.reload()
  await expect(page.getByLabel('需求描述')).toHaveValue('生成个人展示页，保留作品列表')
  await expect(page.locator('.task-status')).toContainText(original)
  const reopened = await context.newPage()
  await page.close(); await fixture.install(reopened); await loginAsDemo(reopened)
  await reopened.goto(`/workbench/${fixture.appId}?taskId=${original}`)
  await expect(reopened.locator('.task-status')).toContainText('正在修复')
  await expect(reopened.locator('[data-sequence]')).toHaveCount(fixture.history.length)
  await expect(reopened.locator('.task-status')).toContainText(original)
  expect(fixture.creates).toBe(1); expect(fixture.idempotencyKeys).toHaveLength(1)
  const sequences = await reopened.locator('[data-sequence]').evaluateAll(items => items.map(item => item.getAttribute('data-sequence')))
  expect(new Set(sequences).size).toBe(fixture.history.length)
  await reopened.screenshot({ path: join(evidence, 'recovered.png'), fullPage: true })
})
