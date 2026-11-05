import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { cp, mkdtemp, readFile, rm } from 'node:fs/promises'
import { join, resolve, extname, sep } from 'node:path'
import { tmpdir } from 'node:os'
import { chromium } from '@playwright/test'
import { build } from '../../../services/runner/src/template/build.mjs'

test('generated task and catalog pages link to one another without exposing placeholder home', { timeout: 90000 }, async () => {
  const scratch = await mkdtemp(join(tmpdir(), 'codeless-navigation-'))
  let browser, server
  try {
    const source = join(scratch, 'source'), output = join(scratch, 'output')
    await cp(new URL('../../../templates/vue/fixtures/tasks', import.meta.url), source, { recursive: true })
    await cp(new URL('../../../templates/vue/fixtures/catalog/src/pages/CatalogPage.vue', import.meta.url),
      join(source, 'src/pages/CatalogPage.vue'))
    await build(source, output)
    server = createServer(async (request, response) => {
      try {
        const path = new URL(request.url, 'http://localhost').pathname
        const file = extname(path) ? path.slice(1) : 'index.html'
        const target = resolve(output, file)
        if (!target.startsWith(resolve(output) + sep)) { response.writeHead(404); response.end(); return }
        response.setHeader('Content-Type', file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : 'text/html')
        response.end(await readFile(target))
      } catch { response.writeHead(404); response.end() }
    })
    await new Promise(done => server.listen(0, '127.0.0.1', done))
    browser = await chromium.launch({ headless: true })
    const page = await browser.newPage()
    await page.goto('http://127.0.0.1:' + server.address().port)
    await page.waitForURL('**/tasks')
    const nav = page.getByRole('navigation', { name: '页面导航' })
    assert.deepEqual(await nav.getByRole('link').allTextContents(), ['任务', '目录'])
    await nav.getByRole('link', { name: '目录' }).click()
    await page.waitForURL('**/catalog')
    assert.equal(await nav.getByRole('link', { name: '目录' }).getAttribute('aria-current'), 'page')
    await nav.getByRole('link', { name: '任务' }).click()
    await page.waitForURL('**/tasks')
    assert.equal(await nav.getByRole('link', { name: '任务' }).getAttribute('aria-current'), 'page')
  } finally {
    await browser?.close()
    if (server) await new Promise(done => { server.close(done); server.closeAllConnections() })
    assert.equal(resolve(scratch).startsWith(resolve(tmpdir())), true)
    await rm(scratch, { recursive: true, force: true })
  }
})
