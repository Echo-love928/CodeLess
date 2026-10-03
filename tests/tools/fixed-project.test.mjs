import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { createServer } from 'node:http'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { extname, join, resolve } from 'node:path'
import test from 'node:test'
import { chromium } from '@playwright/test'
import { createBuildRunner } from '../../services/runner/src/build/runner.mjs'

// Acceptance harness for a fixed repository fixture, not a production browser verifier.
// The only served/visited origin is the random loopback port created in this test.
test('real file tools source -> offline Docker build -> real browser route/LocalStorage/search assertions', { timeout: 180000 }, async () => {
  assert.ok(process.env.CODELESS_FILE_EVIDENCE_DIR, 'Run the Java producer with CODELESS_FILE_EVIDENCE_DIR first')
  const evidence = resolve(process.env.CODELESS_FILE_EVIDENCE_DIR)
  const source = join(evidence, 'fixed-source')
  const record = JSON.parse(await readFile(join(evidence, 'fixed-source.json'), 'utf8'))
  assert.equal(record.results.length, 3)
  assert.ok(record.results.every(result => result.status === 'SUCCEEDED'))
  const manifest = []
  for (const file of record.source.files) {
    const bytes = await readFile(join(source, file.path))
    assert.equal(bytes.length, file.bytes)
    assert.equal(`sha256:${createHash('sha256').update(bytes).digest('hex')}`, file.digest)
    manifest.push({ path: file.path, bytes: file.bytes, digest: file.digest })
  }
  const sourceDigest = `sha256:${createHash('sha256').update(JSON.stringify(manifest)).digest('hex')}`
  assert.equal(sourceDigest, record.source.sourceDigest)
  const build = await createBuildRunner({ workRoot: join(evidence, 'build-work'), artifactRoot: join(evidence, 'artifacts') })
  const result = await build(source)
  await writeFile(join(evidence, 'fixed-build.json'), JSON.stringify({ sourceDigest, ...result }, null, 2))
  assert.equal(result.status, 'SUCCEEDED', JSON.stringify(result))
  assert.equal(result.exitCode, 0)
  assert.ok(result.artifact?.digest)
  const artifact = result.artifact.directory
  const server = createServer(async (req, res) => {
    try {
      const pathname = new URL(req.url, 'http://localhost').pathname
      const path = pathname.startsWith('/assets/') && /^\/assets\/[A-Za-z0-9_.-]+$/.test(pathname)
        ? join(artifact, pathname.slice(1)) : join(artifact, 'index.html')
      const mime = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html' }
      res.writeHead(200, { 'content-type': mime[extname(path)] ?? 'application/octet-stream' })
      res.end(await readFile(path))
    } catch { res.writeHead(404); res.end() }
  })
  await new Promise((done, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', done) })
  const origin = `http://127.0.0.1:${server.address().port}`
  let browser
  const errors = [], blocked = []
  const verification = { status: 'FAILED', sourceDigest, artifactDigest: result.artifact.digest, routes: [], errors, blocked }
  try {
    browser = await chromium.launch({ channel: process.env.CODELESS_PLAYWRIGHT_CHANNEL || undefined, headless: true })
    const context = await browser.newContext()
    await context.route('**/*', route => {
      if (new URL(route.request().url()).origin === origin) return route.continue()
      blocked.push(route.request().url()); return route.abort('blockedbyclient')
    })
    const page = await context.newPage()
    page.on('pageerror', error => errors.push(error.message))
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
    for (const [path, heading] of [['/', '林予安，设计与摄影'], ['/tasks', '今日任务'], ['/catalog', '寻找下一次灵感']]) {
      await page.goto(`${origin}${path}`, { waitUntil: 'networkidle', timeout: 15000 })
      await page.getByRole('heading', { name: heading, exact: true }).waitFor({ state: 'visible', timeout: 5000 })
      assert.ok(await page.locator('#app').innerText())
      verification.routes.push({ path, heading, visible: true })
      if (path === '/tasks') {
        await page.getByRole('textbox', { name: '新任务' }).fill('D08 文件构建浏览器证据')
        await page.getByRole('button', { name: '添加', exact: true }).click()
        await page.reload({ waitUntil: 'networkidle' })
        assert.equal(await page.getByText('D08 文件构建浏览器证据', { exact: true }).count(), 1)
        verification.localStoragePersisted = true
      }
      if (path === '/catalog') {
        await page.getByRole('searchbox', { name: '搜索目录' }).fill('山间书屋')
        assert.equal(await page.locator('article').count(), 1)
        verification.searchFiltered = true
      }
    }
    await mkdir(join(evidence, 'screenshots'), { recursive: true })
    await page.screenshot({ path: join(evidence, 'screenshots', 'fixed-catalog.png'), fullPage: true })
    assert.deepEqual(errors, [])
    assert.deepEqual(blocked, [])
    verification.status = 'SUCCEEDED'
  } catch (error) { verification.failure = error.message; throw error }
  finally {
    await writeFile(join(evidence, 'fixed-browser.json'), JSON.stringify(verification, null, 2))
    await browser?.close()
    await new Promise(done => server.close(done))
  }
})
