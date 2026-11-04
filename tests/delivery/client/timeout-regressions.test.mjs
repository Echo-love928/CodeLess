import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createServer } from 'node:http'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { chromium } from '@playwright/test'
import { inspect } from '../../../evals/browser/browser.mjs'
import { sha } from '../../../evals/browser/core.mjs'
import { closeVerificationBrowser } from '../../../services/runner/src/verify/browser-cleanup.mjs'
import { randomUUID } from 'node:crypto'
import { request } from 'node:http'

test('loopback inspector does not inherit a host/browser proxy', { timeout: 20000 }, async () => {
  let proxyHits = 0
  const proxy = createServer((_req, res) => { proxyHits++; res.writeHead(502); res.end('foreign proxy') })
  proxy.on('connect', (_req, socket) => { proxyHits++; socket.end('HTTP/1.1 502 Bad Gateway\r\n\r\n') })
  await new Promise(done => proxy.listen(0, '127.0.0.1', done))
  const scratch = await mkdtemp(join(tmpdir(), 'd30-proxy-control-'))
  const html = '<!doctype html><html><body><h1>Local artifact</h1></body></html>'
  await writeFile(join(scratch, 'index.html'), html)
  let browser
  try {
    browser = await chromium.launch({ headless: true, proxy: { server: `http://127.0.0.1:${proxy.address().port}`, bypass: '<-loopback>' } })
    const result = await inspect(browser, { directory: scratch, files: [{ path: 'index.html', digest: sha(html) }] },
      { route: '/catalog', output: join('.local-data/d30-b/timeout-fix/controls', randomUUID()), action: async (page, expect) => {
        await expect(page.getByRole('heading')).toHaveText('Local artifact')
      } })
    assert.equal(result.status, 'PASSED', JSON.stringify(result))
    assert.equal(proxyHits, 0, 'artifact navigation reached an inherited proxy')
    const rejected = await inspect(browser, { directory: scratch, files: [{ path: 'index.html', digest: sha(html) }] },
      { route: '/', output: join('.local-data/d30-b/timeout-fix/controls', randomUUID()), action: async page => {
        await page.evaluate(() => fetch('http://192.0.2.1/forbidden').catch(() => {}))
      } })
    assert.equal(rejected.status, 'FAILED')
    assert.ok(rejected.blockedRequests.includes('http://192.0.2.1'))
    assert.equal(proxyHits, 0)
  } finally {
    await browser?.close()
    await new Promise(done => proxy.close(done))
    await rm(scratch, { recursive: true, force: true })
  }
})

test('timeout cleanup terminates an owned browser even if its graceful channel is stalled', { timeout: 15000 }, async () => {
  const server = await chromium.launchServer({ host: '127.0.0.1', headless: true })
  const child = server.process()
  let timer, gracefulCalls = 0
  try {
    await Promise.race([
      closeVerificationBrowser({ close: () => { gracefulCalls++; return new Promise(() => {}) }, kill: () => server.kill() }, { timeoutFailure: true }),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('cleanup awaited the stalled graceful channel')), 1500) }),
    ])
    assert.equal(gracefulCalls, 0)
    assert.ok(child.exitCode !== null || child.signalCode !== null, 'owned Chromium process must actually exit')
  } finally {
    clearTimeout(timer)
    if (child.exitCode === null && child.signalCode === null) await server.kill()
  }
})

test('normal verification retains graceful close and confirms the owned browser exit', { timeout: 15000 }, async () => {
  const server = await chromium.launchServer({ host: '127.0.0.1', headless: true })
  const child = server.process()
  let gracefulCalls = 0, killCalls = 0
  try {
    await closeVerificationBrowser({ close: () => { gracefulCalls++; return server.close() }, kill: () => { killCalls++; return server.kill() } })
    assert.equal(gracefulCalls, 1)
    assert.equal(killCalls, 0)
    assert.ok(child.exitCode !== null || child.signalCode !== null)
  } finally {
    if (child.exitCode === null && child.signalCode === null) await server.kill()
  }
})

test('owned inspection proxy rejects foreign targets, credentials and CONNECT', { timeout: 15000 }, async () => {
  const scratch = await mkdtemp(join(tmpdir(), 'd30-proxy-policy-'))
  const html = '<!doctype html><html><body><h1>Policy</h1></body></html>'
  await writeFile(join(scratch, 'index.html'), html)
  const browser = await chromium.launch({ headless: true })
  const rejected = []
  try {
    const result = await inspect(browser, { directory: scratch, files: [{ path: 'index.html', digest: sha(html) }] },
      { route: '/', output: join('.local-data/d30-b/timeout-fix/controls', randomUUID()), action: async page => {
        const local = new URL(page.url())
        for (const [method, path] of [['GET', 'http://192.0.2.1/'], ['GET', `http://user:password@${local.host}/`], ['CONNECT', '192.0.2.1:443']]) {
          const status = await new Promise((done, reject) => {
            const req = request({ hostname: local.hostname, port: local.port, method, path }, res => { res.resume(); res.on('end', () => done(res.statusCode)) })
            req.on('connect', (res, socket) => { socket.destroy(); done(res.statusCode) })
            req.on('error', reject); req.setTimeout(2000, () => req.destroy(new Error('policy response timed out'))); req.end()
          })
          rejected.push(status)
        }
      } })
    assert.equal(result.status, 'PASSED', JSON.stringify(result))
    assert.deepEqual(rejected, [403, 403, 403])
  } finally {
    await browser.close()
    await rm(scratch, { recursive: true, force: true })
  }
})
