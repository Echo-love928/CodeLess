import { expect, test } from '@playwright/test'
import { installMockAuth, loginAsDemo } from '../auth/mock-auth'

test('entry, application list and workbench navigate and refresh without script errors', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await installMockAuth(page)
  await page.goto('/login')
  await expect(page.getByRole('heading', { name: '开始你的第一件作品' })).toBeVisible()
  await page.reload()
  await expect(page.getByRole('heading', { name: '开始你的第一件作品' })).toBeVisible()
  await loginAsDemo(page)
  await expect(page).toHaveURL(/\/apps$/)
  await expect(page.getByRole('heading', { name: '我的应用' })).toBeVisible()
  await page.reload()
  await expect(page.getByRole('heading', { name: '我的应用' })).toBeVisible()
  await page.getByRole('button', { name: /打开工作台/ }).click()
  await expect(page).toHaveURL(/\/workbench\/11111111-1111-4111-8111-111111111111$/)
  await expect(page.getByLabel('需求描述')).toBeVisible()
  await page.reload()
  await expect(page.getByLabel('需求描述')).toBeVisible()
  expect(errors).toEqual([])
})

test('application search and API contract creation state stay honest', async ({ page }) => {
  await installMockAuth(page)
  await loginAsDemo(page)
  await page.getByRole('searchbox', { name: '搜索应用' }).fill('没有这个应用')
  await expect(page.getByText('没有找到这个应用')).toBeVisible()
  await page.getByRole('button', { name: '清除搜索' }).click()
  await expect(page.getByRole('button', { name: /打开工作台/ })).toBeVisible()
  await page.getByRole('button', { name: '新建应用' }).click()
  await page.getByLabel('应用名称').fill('我的新应用')
  await page.getByRole('dialog').getByRole('button', { name: '创建' }).click()
  await expect(page).toHaveURL(/\/workbench\/00000000-0000-4000-8000-000000000001$/)
  await page.goto('/apps')
  await expect(page.getByRole('heading', { name: '我的新应用' })).toBeVisible()
})

test('workbench shows input, tasks and honest preview state', async ({ page }) => {
  await installMockAuth(page)
  await loginAsDemo(page)
  await page.goto('/workbench/11111111-1111-4111-8111-111111111111')
  await page.getByLabel('需求描述').fill('创建一个活动日程页')
  await expect(page.getByLabel('需求描述')).toHaveValue('创建一个活动日程页')
  await expect(page.getByText('暂无生成任务')).toBeVisible()
  await expect(page.getByText('预览尚未接入')).toBeVisible()
  await expect(page.getByText(/当前可用版本：55555555/)).toBeVisible()
  await expect(page.getByRole('button', { name: /开始生成/ })).toBeDisabled()
  await page.getByRole('button', { name: '手机' }).click()
  await expect(page.getByRole('button', { name: '手机' })).toHaveAttribute('aria-pressed', 'true')
  expect(await page.locator('.editor-canvas').evaluate(element => element.getBoundingClientRect().width)).toBeLessThanOrEqual(360)
  await page.reload()
  await expect(page.getByLabel('需求描述')).toHaveValue('')
})

test('mobile routes have no horizontal overflow and keep the inspector reachable', async ({ page }) => {
  await installMockAuth(page)
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 })
    await page.goto('/login')
    await expect(page.getByRole('heading', { name: '开始你的第一件作品' })).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `/login at ${width}px`).toBeTruthy()
  }
  await loginAsDemo(page)
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 })
    for (const route of ['/apps', '/workbench/11111111-1111-4111-8111-111111111111']) {
      await page.goto(route)
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `${route} at ${width}px`).toBeTruthy()
    }
  }
  await page.goto('/workbench/11111111-1111-4111-8111-111111111111')
  await expect(page.getByLabel('需求描述')).toBeVisible()
})
