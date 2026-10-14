import { expect, test } from '@playwright/test'
import { visualFixture } from './fixture'
import { ids } from '../versions/fixture'

const frame = (page: import('@playwright/test').Page) => page.frameLocator('iframe[title="当前版本预览"]')
async function select(page: import('@playwright/test').Page, instance = 1) {
  await page.getByLabel('选择组件进行修改').check()
  await frame(page).locator('article a').nth(instance - 1).click()
  await expect(page.getByLabel('组件修改描述')).toBeVisible()
}
test('D14-B-T1/T3: text, color, spacing and shared edits use exact new mapping and explicit scope', async ({ page }, info) => {
  const state = await visualFixture(page)
  const cases = [
    { prompt: '将文案改为新文案', change: { text: '新文案' } },
    { prompt: '将颜色改为红色', change: { color: 'rgb(255, 0, 0)' } },
    { prompt: '将间距改为24px', change: { spacing: '24px' } },
    { prompt: '修改共享组件所有实例的文案', change: { text: '共享新文案' } },
  ]
  let base = ids[1]
  for (const [index, item] of cases.entries()) {
    await select(page, index === 3 ? 2 : 1)
    const editor = page.getByRole('region', { name: '组件修改', exact: true })
    await expect(editor).toContainText('src/components/SharedCard.vue')
    await expect(editor).toContainText('整个源码组件及所有实例，包括其他页面')
    if (index === 3) await expect(page.getByRole('region', { name: '预览组件选择' })).toContainText('第 2 / 3')
    await page.getByLabel('组件修改描述').fill(item.prompt)
    await expect(page.getByRole('button', { name: '创建组件修改', exact: true })).toBeDisabled()
    await page.getByLabel('我确认修改影响整个源码组件及所有共享实例').check()
    await page.getByRole('button', { name: '创建组件修改', exact: true }).click()
    await expect(page.getByRole('region', { name: '组件修改任务', exact: true })).toContainText(item.prompt)
    await expect(page.getByLabel('选择组件进行修改')).toBeDisabled()
    expect(state.edits.at(-1)).toEqual({ baseVersionId: base, prompt: item.prompt,
      selection: { componentId: 'shared-card', versionId: base, sourceDigest: state.payloads.get(base)!.digest } })
    await state.finish('READY', item.change)
    await expect(page.getByRole('region', { name: '组件修改任务', exact: true })).toContainText('当前预览已切换至新版本')
    await expect(page.locator('iframe')).toHaveAttribute('src', new RegExp(state.current.versionId.replaceAll('-', '')))
    await expect(page.locator('.page-path')).toContainText(`当前可用版本：${state.current.versionId}`)
    await expect(page.getByLabel('组件修改描述')).toHaveCount(0)
    await expect(page.getByLabel('选择组件进行修改')).toBeEnabled()
    await expect(page.getByLabel('选择组件进行修改')).not.toBeChecked()
    if (item.change.text) await expect(frame(page).locator('article a').first()).toHaveText(item.change.text + ' 1')
    if (item.change.color) await expect(frame(page).locator('article a').first()).toHaveCSS('color', item.change.color)
    if (item.change.spacing) await expect(frame(page).locator('article').first()).toHaveCSS('padding', item.change.spacing)
    if (index === 3) { await expect(frame(page).locator('article a').nth(2)).toHaveText('共享新文案 3'); await page.screenshot({ path: info.outputPath('four-edits.png'), fullPage: true }) }
    base = state.current.versionId
  }
  expect(state.selections.map(item => item.versionId)).toEqual([ids[1], ...state.edits.slice(1).map(item => item.baseVersionId)])
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.setViewportSize({ width: 375, height: 900 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true)
  await page.getByRole('region', { name: '组件修改任务', exact: true }).screenshot({ path: info.outputPath('mobile-edit-task.png') })
  await page.setViewportSize({ width: 900, height: 375 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true)
  await info.attach('four-scopes-and-versions', { body: JSON.stringify({ namedFixture: true, edits: state.edits, selections: state.selections }), contentType: 'application/json' })
})
test('D14-B-T2/T4: failed edit keeps old navigation, readable escaped logs and another edit', async ({ page }, info) => {
  const state = await visualFixture(page)
  await select(page)
  await page.getByLabel('组件修改描述').fill('产生语法错误')
  await page.getByLabel('我确认修改影响整个源码组件及所有共享实例').check()
  await page.getByRole('button', { name: '创建组件修改', exact: true }).click()
  await state.finish('FAILED')
  const result = page.getByRole('region', { name: '组件修改任务', exact: true })
  await expect(result).toContainText('旧版本仍可用')
  await result.locator('summary').click()
  await expect(result).toContainText('退出码：2')
  await expect(result).toContainText('Vue 编译失败：语法错误 <script>window.__logExecuted=true</script>')
  expect(await page.evaluate(() => (window as unknown as { __logExecuted?: boolean }).__logExecuted)).toBeUndefined()
  await expect(page.locator('iframe')).toHaveAttribute('src', new RegExp(ids[1].replaceAll('-', '')))
  await frame(page).locator('article a').first().click()
  await expect.poll(() => frame(page).locator('body').evaluate(() => location.hash)).toBe('#destination')
  await select(page, 2)
  await expect(page.getByLabel('组件修改描述')).toHaveValue('产生语法错误')
  await expect(page.getByLabel('我确认修改影响整个源码组件及所有共享实例')).not.toBeChecked()
  await page.getByLabel('组件修改描述').fill('重新修改文案')
  await page.getByLabel('我确认修改影响整个源码组件及所有共享实例').check()
  await page.getByRole('button', { name: '创建组件修改', exact: true }).click()
  expect(state.edits[1].baseVersionId).toBe(ids[1])
  await state.finish('READY', { text: '恢复成功' })
  await expect(frame(page).locator('article a').first()).toHaveText('恢复成功 1')
  await page.screenshot({ path: info.outputPath('failure-recovery.png'), fullPage: true })
})
test('unknown state and conflicts retain old version and composition without auto retry', async ({ page }) => {
  const state = await visualFixture(page)
  state.denyEdit(409)
  await select(page)
  await page.getByLabel('组件修改描述').fill('保留此需求')
  await page.getByLabel('我确认修改影响整个源码组件及所有共享实例').check()
  await page.getByRole('button', { name: '创建组件修改', exact: true }).click()
  await expect(page.getByRole('region', { name: '组件修改', exact: true })).toContainText('你的描述已保留')
  await select(page)
  await expect(page.getByLabel('组件修改描述')).toHaveValue('保留此需求')
  state.denyEdit(202)
  await page.getByLabel('我确认修改影响整个源码组件及所有共享实例').check()
  await page.getByRole('button', { name: '创建组件修改', exact: true }).click()
  await state.finish('FUTURE')
  await expect(page.getByRole('region', { name: '组件修改任务', exact: true })).toContainText('任务状态未知')
  await expect(page.getByLabel('选择组件进行修改')).toBeDisabled()
  await expect(page.locator('iframe')).toHaveAttribute('src', new RegExp(ids[1].replaceAll('-', '')))
  expect(state.edits).toHaveLength(2)
})
