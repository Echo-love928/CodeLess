// Run on a separate machine/network. Public data only; never needs a login credential.
import assert from 'node:assert/strict'
import { readFile, mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import https from 'node:https'
import tls from 'node:tls'
import { chromium, expect } from '@playwright/test'

const report = JSON.parse(await readFile(process.argv[2], 'utf8'))
const evidence = process.argv[3]
await mkdir(evidence, { recursive: true })
const url = new URL(report.publication.url)
assert.equal(url.protocol, 'https:')
assert.match(url.hostname, /^d[a-f0-9]{32}\.sites\.codeless-publish\.top$/)
assert.equal(url.pathname, '/')
assert.equal(url.search, '')
const get = value => new Promise((done, reject) => {
  const request = https.get(value, { signal: AbortSignal.timeout(30000) }, response => {
    let bytes = 0
    const chunks = []
    response.on('data', chunk => {
      bytes += chunk.length
      if (bytes > 32 * 1024 * 1024) response.destroy(new Error('Public asset byte limit'))
      else chunks.push(chunk)
    })
    response.on('error', reject)
    response.on('end', () => done({ status: response.statusCode, headers: response.headers,
      authorized: response.socket?.authorized ?? true, body: Buffer.concat(chunks) }))
  })
  request.on('error', reject)
})
const files = []
for (const file of report.publishedFiles) {
  console.log(JSON.stringify({ externalCheck: 'frozen-asset', path: file.path }))
  assert.ok(file.path === 'index.html' || /^assets\/[A-Za-z0-9_-]+\.(js|css|svg|png|jpg|jpeg|webp|ico|woff|woff2)$/.test(file.path))
  const response = await get(new URL(file.path, url))
  assert.equal(response.status, 200)
  assert.equal(response.headers.location, undefined)
  assert.equal(response.headers['set-cookie'], undefined)
  assert.equal(response.body.length, file.bytes)
  assert.equal('sha256:' + createHash('sha256').update(response.body).digest('hex'), file.digest)
  files.push({ path: file.path, digest: file.digest, bytes: file.bytes })
}
for (const path of ['/tasks', '/catalog']) assert.equal((await get(new URL(path, url))).status, 200)
for (const path of ['/assets/missing.js', '/src/pages/HomePage.vue', '/assets/index.js.map', '/.git/config', '/__deployment.json', '/ai-component-catalog.json', '/api/v0/auth/csrf', '/assets/'])
  assert.equal((await get(new URL(path, url))).status, 404)
const unknownSni = await new Promise(done => {
  const connection = tls.connect({ host: '23.136.172.128', port: 443, servername: 'unknown.codeless-platform.top', rejectUnauthorized: true })
  connection.setTimeout(4000)
  connection.on('secureConnect', () => { connection.destroy(); done('UNEXPECTED_TLS_SUCCESS') })
  connection.on('error', error => done(error.code))
  connection.on('timeout', () => { connection.destroy(); done('TIMEOUT') })
})
assert.ok(['ECONNRESET', 'EPROTO'].includes(unknownSni), 'Unknown SNI must close before completing TLS: ' + unknownSni)
const browser = await chromium.launch({ headless: true })
try {
  const context = await browser.newContext({ serviceWorkers: 'block', acceptDownloads: false })
  const page = await context.newPage()
  for (const path of ['/', '/tasks', '/catalog']) {
    const expected = () => path === '/'
      ? expect(page.locator('[data-testid="profile-name"]')).toHaveText('Ada Lovelace')
      : expect(page.getByRole('heading', { name: path === '/tasks' ? '任务' : '目录', exact: true })).toBeVisible()
    await page.goto(new URL(path, url).href)
    await expected()
    await page.reload()
    await expected()
  }
  assert.equal((await context.cookies()).length, 0)
  await page.goto(url.href)
  await expect(page.locator('[data-testid="profile-name"]')).toHaveText('Ada Lovelace')
  await page.screenshot({ path: join(evidence, 'external-published-page.png'), fullPage: true })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.screenshot({ path: join(evidence, 'external-published-mobile.png'), fullPage: true })
  await context.close()
} finally { await browser.close() }
const result = { status: 'PASSED', independentMachine: true, loginCredentialsUsed: false, normalPublicDns: true,
  normalTlsValidation: true, unknownSniClosed: true, url: url.href, files, browserRoutesAndRefresh: true,
  sourceAndMetadataDenied: true, cookiesAbsent: true, publicMilestoneReached: false,
  note: 'Combine with same-candidate server browser, SQL, phase ledger and worker checks before final acceptance.' }
await writeFile(join(evidence, 'external-acceptance.json'), JSON.stringify(result, null, 2))
console.log(JSON.stringify(result))
