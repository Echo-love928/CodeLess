import { expect, test } from '@playwright/test'

test('entry, application list and workbench navigate and refresh without script errors', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))

  await page.goto('/login')
  await expect(page.getByRole('heading', { name: '开始你的第一件作品' })).toBeVisible()
  await page.reload()
  await expect(page.getByRole('heading', { name: '开始你的第一件作品' })).toBeVisible()

  await page.getByRole('link', { name: /进入本地演示/ }).click()
  await expect(page).toHaveURL(/\/apps$/)
  await expect(page.getByRole('heading', { name: '我的应用' })).toBeVisible()
  await page.reload()
  await expect(page.getByRole('heading', { name: '我的应用' })).toBeVisible()

  await page.getByRole('button', { name: /继续编辑/ }).click()
  await expect(page).toHaveURL(/\/workbench\/demo$/)
  await expect(page.getByLabel('社团活动页示例')).toBeVisible()
  await page.reload()
  await expect(page.getByLabel('社团活动页示例')).toBeVisible()
  expect(errors).toEqual([])
})

test('search, starter brief and feedback work without claiming generation', async ({ page }) => {
  await page.goto('/apps')
  await page.getByRole('searchbox', { name: '搜索应用' }).fill('没有这个应用')
  await expect(page.getByText('没有找到这个应用')).toBeVisible()
  await page.getByRole('button', { name: '清除搜索' }).click()
  await expect(page.getByRole('button', { name: /继续编辑/ })).toBeVisible()

  await page.getByRole('button', { name: /个人作品集/ }).click()
  await expect(page.getByLabel('描述应用需求')).toHaveValue(/个人作品集/)
  await page.getByRole('button', { name: '提交应用需求' }).click()
  await expect(page.getByRole('status')).toContainText('尚未接入')
})

test('workbench editing, device switch and state recovery are preview only', async ({ page }) => {
  await page.goto('/workbench/demo')
  await page.getByRole('button', { name: '选择活动标题并编辑' }).click()
  await page.getByLabel('文字内容').fill('社团秋日见面会')
  await expect(page.getByRole('button', { name: '选择活动标题并编辑' })).toContainText('社团秋日见面会')
  await page.getByRole('button', { name: '选择活动按钮并编辑' }).click()
  await page.getByLabel('文字内容').fill('查看活动日程')
  await expect(page.getByRole('button', { name: '选择活动按钮并编辑' })).toContainText('查看活动日程')
  await page.getByRole('button', { name: '手机' }).click()
  await expect(page.getByRole('button', { name: '手机' })).toHaveAttribute('aria-pressed', 'true')
  expect(await page.locator('.editor-canvas').evaluate(element => element.getBoundingClientRect().width)).toBeLessThanOrEqual(360)

  await page.getByLabel('预览状态').selectOption('loading')
  await expect(page.getByText('正在准备预览')).toBeVisible()
  await page.getByLabel('预览状态').selectOption('empty')
  await expect(page.getByText('这里还没有内容')).toBeVisible()
  await page.getByLabel('预览状态').selectOption('error')
  await expect(page.getByRole('alert')).toContainText('内容加载失败')
  await page.getByRole('button', { name: '重试' }).click()
  await expect(page.getByText('正在准备预览')).toBeVisible()
  await page.getByLabel('预览状态').selectOption('ready')
  await expect(page.getByLabel('社团活动页示例')).toBeVisible()
  await page.reload()
  await expect(page.getByRole('button', { name: '选择活动标题并编辑' })).toContainText('把热爱')
})

test('mobile routes have no horizontal overflow and keep the inspector reachable', async ({ page }) => {
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 })
    for (const route of ['/login', '/apps', '/workbench/demo']) {
      await page.goto(route)
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `${route} at ${width}px`).toBeTruthy()
    }
  }
  await page.getByRole('button', { name: '选择活动标题并编辑' }).click()
  await expect(page.getByLabel('文字内容')).toBeVisible()
})
