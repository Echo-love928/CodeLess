import { expect, test } from '@playwright/test'
import { recoveryFixture } from './fixture'
import { visualFixture } from '../visual-edit/fixture'
import { ids } from '../versions/fixture'

test('D18-B review: reconnect explains restart wait without inventing a terminal state', async ({ page }) => {
  const state = await recoveryFixture(page, 'INTERRUPTED', 'GENERATE')
  await page.getByLabel('需求描述').fill('等待服务恢复')
  await page.getByRole('button', { name: '开始生成', exact: true }).click()
  await expect(page.getByText('若服务刚刚重启', { exact: false })).toBeVisible()
  await expect(page.locator('.workbench-task')).toContainText('约一分钟再刷新任务')
  await expect(page.locator('.task-status')).toContainText('正在生成')
  await expect(page.locator('.task-status')).not.toContainText('生成完成')
  await expect(page.getByRole('button', { name: '开始生成', exact: true })).toBeDisabled()
  const task = [...state.tasks.values()][0]
  task.status = 'FAILED'; task.failureCode = 'INTERRUPTED'; task.updatedAt = '2026-10-20T00:01:02Z'
  await page.getByRole('button', { name: '刷新任务', exact: true }).click()
  await expect(page.locator('.task-status')).toContainText('INTERRUPTED')
  await expect(page.getByText('若服务刚刚重启', { exact: false })).toHaveCount(0)
  expect(state.posts).toHaveLength(1)
})

for (const [code, text] of [
  ['MODEL_NETWORK', '模型服务连接失败'], ['AGENT_BUILD_EXIT', '源码未通过构建'],
  ['AGENT_MODEL_BUDGET_EXCEEDED', '预算已耗尽'], ['INTERRUPTED', '服务重启'],
  ['FUTURE_FAILURE', '联系维护者确认'],
]) test(`D18-B-T1 ${code}: terminal recovery controls settle and preserve the preview`, async ({ page }) => {
  const state = await recoveryFixture(page, code)
  await page.getByLabel('需求描述').fill('生成活动页面')
  await page.getByRole('button', { name: '开始生成', exact: true }).click()
  await expect(page.locator('.task-status')).toContainText(text)
  await expect(page.locator('.task-status')).toHaveAttribute('aria-busy', 'false')
  await expect(page.locator('.task-status')).toContainText(code)
  await expect(page.getByRole('button', { name: '重试生成', exact: true })).toBeEnabled()
  await expect(page.getByRole('button', { name: '刷新任务', exact: true })).toBeEnabled()
  await expect(page.getByRole('button', { name: '取消任务', exact: true })).toHaveCount(0)
  await expect(page.locator('iframe')).toHaveAttribute('src', new RegExp(ids[1].replaceAll('-', '')))
  state.failReads(true)
  await page.getByRole('button', { name: '刷新任务', exact: true }).click()
  await expect(page.locator('.workbench-task')).toContainText('服务暂时不可用')
  await expect(page.getByRole('button', { name: '刷新任务', exact: true })).toBeEnabled()
  expect(state.posts).toHaveLength(1)
})

test('D18-B-T2 accepted failure retries with a new identity and retains the old task across reload', async ({ page }, info) => {
  const state = await recoveryFixture(page)
  await page.getByLabel('需求描述').fill('生成活动页面')
  await page.getByRole('button', { name: '开始生成', exact: true }).click()
  await expect(page.locator('.task-status')).toContainText('生成失败')
  const oldId = [...state.tasks.keys()][0]
  await page.getByRole('button', { name: '重试生成', exact: true }).click()
  await expect.poll(() => state.tasks.size).toBe(2)
  const newId = [...state.tasks.keys()][1]
  await expect(page).toHaveURL(new RegExp(`taskId=${newId}`))
  expect(state.posts[0].key).not.toBe(state.posts[1].key)
  await page.reload()
  await expect(page.locator('.task-status')).toContainText(newId)
  await page.locator('.task-history summary').click()
  await page.getByRole('link', { name: `查看任务 ${oldId}`, exact: true }).click()
  await expect(page.locator('.task-status')).toContainText(oldId)
  expect(state.posts).toHaveLength(2)
  expect(state.tasks.get(oldId)?.status).toBe('FAILED')
  await page.screenshot({ path: info.outputPath('retained-task.png'), fullPage: true })
})

test('D18-B-T2 lost response reload reconciles the same request without duplicate task', async ({ page }) => {
  const state = await recoveryFixture(page)
  state.loseNextResponse()
  await page.getByLabel('需求描述').fill('保留原提交')
  await page.getByRole('button', { name: '开始生成', exact: true }).click()
  await expect(page.getByRole('button', { name: '核对本次提交', exact: true })).toBeEnabled()
  await expect(page.getByRole('button', { name: '刷新任务', exact: true })).toHaveCount(0)
  await page.reload()
  await expect(page.getByLabel('需求描述')).toHaveValue('保留原提交')
  await expect(page.getByLabel('需求描述')).toHaveAttribute('readonly', '')
  await page.getByRole('button', { name: '核对本次提交', exact: true }).click()
  await expect(page.locator('.task-status')).toContainText('生成失败')
  expect(state.posts).toHaveLength(2)
  expect(state.posts[0]).toEqual(state.posts[1])
  expect(state.tasks.size).toBe(1)
})

test('D18-B-T1 hanging task submit stops loading at the production deadline without retry', async ({ page }) => {
  const state = await recoveryFixture(page)
  state.hang()
  await page.getByLabel('需求描述').fill('等待超时')
  await page.getByRole('button', { name: '开始生成', exact: true }).click()
  await expect(page.getByRole('button', { name: '正在提交…', exact: true })).toBeDisabled()
  await expect(page.getByRole('button', { name: '核对本次提交', exact: true })).toBeEnabled({ timeout: 20_000 })
  await expect(page.locator('.workbench-task')).toContainText('网络连接失败')
  expect(state.posts).toHaveLength(1)
})

test('D18-B-T3/T4 keyboard submit and long logs remain usable at 375px and landscape', async ({ page }, info) => {
  const state = await recoveryFixture(page)
  await page.setViewportSize({ width: 375, height: 812 })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  const prompt = page.getByLabel('需求描述')
  await prompt.fill('第一行'); await prompt.press('End'); await prompt.press('Enter')
  expect(state.posts).toHaveLength(0)
  await expect(prompt).toHaveValue('第一行\n')
  await prompt.press('Control+Enter')
  await expect(page.locator('.task-status')).toContainText('生成失败')
  expect(state.posts).toHaveLength(1)
  await expect(page.locator('.task-status')).toHaveAttribute('aria-busy', 'false')
  const entry = page.locator('[data-sequence="1"] details')
  await expect(entry).not.toHaveAttribute('open')
  await entry.locator('summary').focus(); await page.keyboard.press('Enter')
  await expect(entry).toHaveAttribute('open', '')
  await expect(entry.getByLabel('完整日志，可滚动查看')).toHaveText(state.message)
  expect(await page.evaluate(() => (window as unknown as { __recoveryExecuted?: boolean }).__recoveryExecuted)).toBeUndefined()
  for (const size of [{ width: 375, height: 812 }, { width: 812, height: 375 }]) {
    await page.setViewportSize(size)
    await expect(page.locator('.task-status')).toBeVisible()
    await page.locator('iframe').scrollIntoViewIfNeeded()
    await expect(page.frameLocator('iframe').getByRole('heading', { name: '版本 2 页面' })).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true)
    await page.screenshot({ path: info.outputPath(`workbench-${size.width}.png`), fullPage: true })
  }
})

test('D18-B-T3 Escape in preview or platform returns focus to component selection', async ({ page }) => {
  await visualFixture(page)
  const toggle = page.getByLabel('选择组件进行修改')
  await toggle.focus(); await page.keyboard.press('Space'); await expect(toggle).toBeChecked()
  await page.keyboard.press('Escape'); await expect(toggle).not.toBeChecked(); await expect(toggle).toBeFocused()
  await page.keyboard.press('Space')
  const frame = page.frameLocator('iframe[title="当前版本预览"]')
  await frame.locator('article a').first().focus(); await page.keyboard.press('Escape')
  await expect(toggle).not.toBeChecked(); await expect(toggle).toBeFocused()
})
