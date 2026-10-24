import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { readFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { once } from 'node:events'
import { expect } from '@playwright/test'
import { behavior } from './cases.mjs'
import { sha } from './core.mjs'

// Only a manifest-backed disposable loopback server is reachable by generated JS.
export async function inspect(browser, artifact, { id, route, query = '', output, action = null }) {
  await mkdir(output, { recursive: true })
  const approved = new Map(artifact.files.map(file => ['/' + file.path, file]))
  const content = new Map()
  for (const [path, file] of approved) {
    const bytes = await readFile(join(artifact.directory, file.path))
    assert.equal(sha(bytes), file.digest); content.set(path, bytes)
  }
  const server = createServer((request, response) => {
    const path = new URL(request.url, 'http://fixture.test').pathname
    const key = ['/', '/tasks', '/catalog'].includes(path) ? '/index.html' : path
    if (!content.has(key)) { response.writeHead(404); response.end(); return }
    response.writeHead(200, { 'Content-Type': key.endsWith('.js') ? 'text/javascript' : key.endsWith('.css') ? 'text/css' : key.endsWith('.json') ? 'application/json' : 'text/html', 'Cache-Control': 'no-store' })
    response.end(content.get(key))
  })
  server.listen(0, '127.0.0.1'); await once(server, 'listening')
  const origin = 'http://127.0.0.1:' + server.address().port
  let context, page
  const result = { status: 'FAILED', failure: null, pageErrors: [], consoleErrors: [], blockedRequests: [], failedRequests: [], screenshot: null, trace: null }
  try {
    context = await browser.newContext({ serviceWorkers: 'block', viewport: { width: 1280, height: 900 } })
    await context.route('**/*', async request => {
      const url = new URL(request.request().url())
      if (url.origin === origin && (approved.has(url.pathname) || ['/', '/tasks', '/catalog'].includes(url.pathname))) return request.continue()
      result.blockedRequests.push(url.protocol + '//' + url.host); await request.abort('blockedbyclient')
    })
    await context.routeWebSocket(/.*/, socket => { result.blockedRequests.push('WEBSOCKET'); socket.close() })
    await context.tracing.start({ screenshots: true, snapshots: true, sources: false })
    page = await context.newPage()
    page.setDefaultTimeout(4000); page.setDefaultNavigationTimeout(10000)
    page.on('pageerror', error => result.pageErrors.push(error.message.slice(0, 500)))
    page.on('console', message => { if (message.type() === 'error') result.consoleErrors.push(message.text().slice(0, 500)) })
    page.on('requestfailed', request => result.failedRequests.push(new URL(request.url()).pathname))
    const response = await page.goto(origin + route + query, { waitUntil: 'load' })
    assert.equal(response.status(), 200)
    const body = page.locator('body')
    if (!(await body.innerText()).trim() || !(await body.boundingBox())?.height) { result.failure = 'WHITE_SCREEN'; throw new Error('No visible page content') }
    if (action) await action(page, expect)
    else await behavior(page, id, expect)
    assert.equal(result.pageErrors.length, 0, 'Runtime exception')
    assert.equal(result.consoleErrors.length, 0, 'Console error')
    assert.equal(result.blockedRequests.length, 0, 'External request rejected')
    assert.equal(result.failedRequests.length, 0, 'Failed asset request')
    result.status = 'PASSED'
  } catch (error) {
    result.failure ??= result.pageErrors.length ? 'RUNTIME_ERROR' : 'BEHAVIOR_ERROR'
    result.error = error.message.slice(0, 1500)
  } finally {
    try {
      if (page) { await page.screenshot({ path: join(output, 'page.png'), timeout: 5000 }); result.screenshot = { path: 'page.png', digest: sha(await readFile(join(output, 'page.png'))) } }
      if (context) { await context.tracing.stop({ path: join(output, 'trace.zip') }); result.trace = { path: 'trace.zip', digest: sha(await readFile(join(output, 'trace.zip'))) } }
    } catch (error) { result.status = 'FAILED'; result.failure = 'EVIDENCE_ERROR'; result.evidenceError = error.message }
    await context?.close()
    await new Promise(done => server.close(done))
  }
  return result
}
