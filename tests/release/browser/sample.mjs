// Independent public sample/isolation check, even when platform auth bootstrap is blocked.
import { chromium, expect } from '@playwright/test'
import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
const output = resolve(process.argv[2])
await mkdir(output)
const platform = 'https://app.codeless-platform.top'
const sample = 'https://d9f35ba94b79e8fb89361da2498b8dbf5.sites.codeless-publish.top'
const report = { task: 'D27-B', status: 'RUNNING', authenticatedSession: false,
  scope: 'current historical sample + synthetic cookie + real cross-site LocalStorage; not platform login or D27 deployment',
  platformBootstrapPassed: false, publicCandidateDeployed: 'UNKNOWN', steps: [] }
let browser, context
try {
  browser = await chromium.launch({ headless: true })
  context = await browser.newContext({ serviceWorkers: 'block' })
  assert.equal((await context.cookies()).length, 0)
  const platformPage = await context.newPage()
  const response = await platformPage.goto(platform, { waitUntil: 'domcontentloaded', timeout: 30000 })
  assert.equal(response.status(), 200)
  await platformPage.evaluate(() => localStorage.setItem('d27-platform-canary', 'platform-only'))
  await context.addCookies([{ name: 'JSESSIONID', value: 'D27_SYNTHETIC_NON_AUTH_CANARY',
    url: platform, secure: true, httpOnly: true, sameSite: 'Lax' }])
  const page = await context.newPage(), requestChecks = [], errors = []
  page.on('pageerror', error => errors.push(error.name))
  page.on('request', request => {
    if (new URL(request.url()).origin === sample) requestChecks.push(request.allHeaders().then(headers => {
      assert.ok(!headers.cookie?.includes('D27_SYNTHETIC'))
    }))
  })
  for (const path of ['/', '/tasks', '/catalog']) {
    const response = await page.goto(sample + path, { waitUntil: 'networkidle', timeout: 30000 })
    assert.equal(response.status(), 200)
    const visible = async () => path === '/'
      ? expect(page.locator('[data-testid="profile-name"]')).toHaveText('Ada Lovelace')
      : expect(page.getByRole('heading', { name: path === '/tasks' ? '任务' : '目录', exact: true })).toBeVisible()
    await visible()
    assert.equal(await page.evaluate(() => localStorage.getItem('d27-platform-canary')), null)
    await page.evaluate(() => localStorage.setItem('d27-sample-canary', 'sample-only'))
    await page.reload({ waitUntil: 'networkidle' }); await visible()
    assert.equal(await page.evaluate(() => localStorage.getItem('d27-sample-canary')), 'sample-only')
    report.steps.push({ path, status: 'PASSED', refreshed: true })
  }
  assert.equal(await platformPage.evaluate(() => localStorage.getItem('d27-sample-canary')), null)
  assert.equal(await platformPage.evaluate(() => localStorage.getItem('d27-platform-canary')), 'platform-only')
  await Promise.all(requestChecks)
  assert.equal((await context.cookies(sample)).some(cookie => cookie.name === 'JSESSIONID'), false)
  assert.equal(errors.length, 0)
  await page.screenshot({ path: join(output, 'sample.png'), fullPage: true })
  report.status = 'PASSED'
} catch (error) {
  report.status = 'FAILED'; report.error = { name: error.name, code: error.code ?? null }; process.exitCode = 1
} finally {
  await context?.close(); await browser?.close()
  await writeFile(join(output, 'sample.json'), JSON.stringify(report, null, 2) + '\n')
  console.log(JSON.stringify(report))
}
