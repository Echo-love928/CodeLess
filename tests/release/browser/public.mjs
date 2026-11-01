// Read-only public smoke; no authentication, publication, TLS exceptions or request fixtures.
import assert from 'node:assert/strict'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { chromium, expect } from '@playwright/test'
import { hash, verify } from '../../../infra/release/client/package.mjs'

const [commit, bundlePath, evidencePath] = process.argv.slice(2)
const bundle = resolve(bundlePath), output = resolve(evidencePath)
const manifest = await verify(bundle, commit)
await mkdir(output) // Evidence never overwrites a previous run.
const historical = JSON.parse(await readFile(new URL('../../../docs/deployment/evidence/D15-public-2026-10-18/aggregate.json', import.meta.url)))
const config = manifest.config
const report = { task: 'D27-B', commit, status: 'RUNNING', startedAt: new Date().toISOString(),
  candidateDeployed: 'UNKNOWN', scope: 'current public anonymous access; historical sample, not D27 publication',
  tlsExceptions: false, mockedRequests: false, steps: [], error: null }
let browser, context
try {
  browser = await chromium.launch({ headless: true })
  context = await browser.newContext({ serviceWorkers: 'block', acceptDownloads: false })
  assert.equal((await context.cookies()).length, 0)
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', error => errors.push(error.name))
  for (const path of ['/', '/applications']) {
    const response = await page.goto(config.platformOrigin + path, { timeout: 30000, waitUntil: 'networkidle' })
    assert.equal(response.status(), 200)
    await expect(page.getByRole('button', { name: '登录', exact: true })).toBeVisible()
    await page.reload({ waitUntil: 'networkidle' })
    report.steps.push({ name: 'platform route and reload', path, status: 'PASSED' })
  }
  const live = await context.request.get(config.platformOrigin + '/')
  const matches = hash(await live.body()) === manifest.files['web/index.html'].sha256
  report.candidateWebIndexMatches = matches
  // Matching index alone cannot attest the deployed runner or API.
  const js = page.locator('script[src]').first()
  const asset = await js.getAttribute('src')
  const response = await context.request.get(new URL(asset, config.platformOrigin).href)
  assert.equal(response.status(), 200)
  assert.match(response.headers()['content-type'], /javascript/)
  assert.equal((await context.request.get(config.platformOrigin + '/internal/preview/health')).status(), 404)
  assert.equal((await context.request.get(config.platformOrigin + '/api/v0/auth/me')).status(), 401)
  report.steps.push({ name: 'JS asset / private route / anonymous API', status: 'PASSED' })
  // Synthetic canary is not an authenticated reviewer account. It tests browser site boundaries.
  await context.addCookies([{ name: 'JSESSIONID', value: 'D27_SYNTHETIC_NON_AUTH_CANARY',
    url: config.platformOrigin, secure: true, httpOnly: true, sameSite: 'Lax' }])
  await page.evaluate(() => localStorage.setItem('d27-platform-canary', 'platform-only'))
  const leaked = []
  page.on('request', request => {
    if (new URL(request.url()).hostname.endsWith('.sites.codeless-publish.top') && request.headers().cookie?.includes('D27_SYNTHETIC')) leaked.push(true)
  })
  for (const path of ['/', '/tasks', '/catalog']) {
    const response = await page.goto(new URL(path, historical.publicationUrl).href, { timeout: 30000, waitUntil: 'networkidle' })
    assert.equal(response.status(), 200)
    if (path === '/') await expect(page.locator('[data-testid="profile-name"]')).toHaveText('Ada Lovelace')
    else await expect(page.getByRole('heading', { name: path === '/tasks' ? '任务' : '目录', exact: true })).toBeVisible()
    await page.reload({ waitUntil: 'networkidle' })
    assert.equal(await page.evaluate(() => localStorage.getItem('d27-platform-canary')), null)
    report.steps.push({ name: 'sample route / reload / isolated storage', path, status: 'PASSED' })
  }
  assert.equal((await context.cookies(historical.publicationUrl)).some(c => c.name === 'JSESSIONID'), false)
  assert.equal(leaked.length, 0)
  assert.equal(errors.length, 0)
  await page.screenshot({ path: join(output, 'sample.png'), fullPage: true })
  report.steps.push({ name: 'synthetic host-only session isolation', status: 'PASSED', authenticatedSession: false })
  report.status = 'PASSED'
} catch (error) {
  report.status = 'FAILED'
  // Do not persist arbitrary browser error text: URLs may contain credentials in other workflows.
  report.error = { name: error.name, code: error.code ?? null }
  process.exitCode = 1
} finally {
  await context?.close(); await browser?.close()
  report.completedAt = new Date().toISOString()
  await writeFile(join(output, 'public.json'), JSON.stringify(report, null, 2) + '\n')
  console.log(JSON.stringify(report))
}
