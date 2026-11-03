// Read-only public acceptance. No login, request fixtures, TLS bypass or deployment.
import assert from 'node:assert/strict'
import { chromium, expect } from '@playwright/test'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'

const output = resolve(process.argv[2])
await mkdir(output) // Never overwrite another run.
const digest = bytes => createHash('sha256').update(bytes).digest('hex')
const historicalPath = 'tests/release/browser/evidence/final-61df15e/external-new-site.json'
const historicalBytes = await readFile(historicalPath)
const historical = JSON.parse(historicalBytes)
const platform = 'https://app.codeless-platform.top'
const report = { task: 'D28-B', scope: 'current anonymous public observation of historical D27 site',
  checkout: spawnSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8', windowsHide: true }).stdout.trim(),
  startedAt: new Date().toISOString(), status: 'RUNNING', deployedSourceCommit: 'UNKNOWN',
  historicalSourceCommit: '61df15eba456422762a667aaed7734b7d13b48e7',
  input: { path: historicalPath, sha256: digest(historicalBytes) },
  publicUrl: historical.url, tlsExceptions: false, mockedRequests: false, loginCredentialsUsed: false,
  checks: [], artifacts: [], error: null }
let browser, context
try {
  browser = await chromium.launch({ headless: true })
  context = await browser.newContext({ serviceWorkers: 'block', acceptDownloads: false })
  assert.equal((await context.cookies()).length, 0)
  await context.tracing.start({ screenshots: true, snapshots: true, sources: true })
  const page = await context.newPage()
  page.setDefaultTimeout(15000)
  page.setDefaultNavigationTimeout(30000)
  const errors = []
  page.on('pageerror', error => errors.push(error.name))
  const get = async (url, status) => {
    const response = await context.request.get(url, { timeout: 30000, maxRedirects: 0 })
    assert.equal(response.status(), status)
    return response
  }
  for (const path of ['/login', '/apps']) {
    assert.equal((await page.goto(platform + path, { waitUntil: 'networkidle' })).status(), 200)
    await expect(page.getByRole('button', { name: '登录', exact: true })).toBeVisible()
    assert.equal(new URL(page.url()).pathname, '/login')
    await page.reload({ waitUntil: 'networkidle' })
    await expect(page.getByRole('button', { name: '登录', exact: true })).toBeVisible()
    report.checks.push({ name: 'anonymous-platform-login-guard', path, status: 'PASSED' })
  }
  await page.screenshot({ path: join(output, 'anonymous-login.png'), fullPage: true })
  await get(platform + '/api/v0/auth/me', 401)
  await get(platform + '/internal/preview/health', 404)
  for (const item of historical.files) {
    const response = await get(new URL(item.path, historical.url).href, 200)
    const bytes = await response.body()
    assert.equal(bytes.length, item.bytes)
    assert.equal('sha256:' + digest(bytes), item.digest)
    report.checks.push({ name: 'historical-public-asset-current-bytes', path: item.path, digest: item.digest, status: 'PASSED' })
  }
  for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport)
    for (const path of ['/', '/tasks', '/catalog']) {
      assert.equal((await page.goto(new URL(path, historical.url).href, { waitUntil: 'networkidle' })).status(), 200)
      await page.reload({ waitUntil: 'networkidle' })
      if (path === '/') await expect(page.getByTestId('profile-name')).toHaveText('Ada Lovelace')
      else await expect(page.getByRole('heading', { name: path === '/tasks' ? '任务' : '目录', exact: true })).toBeVisible()
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true)
      await page.screenshot({ path: join(output, `public-${viewport.width}-${path === '/' ? 'home' : path.slice(1)}.png`), fullPage: true })
      report.checks.push({ name: 'generated-route-refresh-responsive', path, viewport, status: 'PASSED' })
    }
  }
  for (const path of ['/src/pages/HomePage.vue', '/.git/config', '/__deployment.json', '/ai-component-catalog.json', '/assets/missing.js'])
    await get(new URL(path, historical.url).href, 404)
  assert.equal((await context.cookies()).length, 0)
  assert.deepEqual(errors, [])
  report.checks.push({ name: 'private-source-denied-no-cookie-no-page-error', status: 'PASSED' })
  report.status = 'PASSED'
} catch (error) {
  report.status = 'FAILED'
  report.error = { name: error.name, code: error.code ?? null }
  await writeFile(join(output, 'failure.private.txt'), String(error.stack ?? error))
  process.exitCode = 1
} finally {
  try { await context?.tracing.stop({ path: join(output, 'trace.zip') }) }
  catch (error) { report.traceError = error.name; report.status = 'FAILED'; process.exitCode = 1 }
  await context?.close()
  await browser?.close()
  for (const name of ['trace.zip', 'anonymous-login.png', ...[1440, 390].flatMap(width => ['home', 'tasks', 'catalog'].map(route => `public-${width}-${route}.png`))]) {
    try { const bytes = await readFile(join(output, name)); report.artifacts.push({ path: name, bytes: bytes.length, sha256: digest(bytes) }) }
    catch { /* Partial runs retain only artifacts that actually exist. */ }
  }
  report.completedAt = new Date().toISOString()
  await writeFile(join(output, 'result.json'), JSON.stringify(report, null, 2) + '\n')
  console.log(JSON.stringify(report))
}
