import { chromium } from '@playwright/test'
import { createServer } from 'node:http'
import { createAssetReader } from './network.mjs'
import { CSP } from '../artifacts/service.mjs'
import { pathToFileURL } from 'node:url'

// The injected request is a private test dependency; stdio accepts no transport options.
export async function capturePage(job, request) {
const asset = createAssetReader(job, request), origin = new URL(job.url)
let browserServer, proxy, blocked = false, failed = false
const result = { status: 'FAILED', failure: 'CAPTURE_FAILED', browserClosed: false, screenshot: null }
const mime = { html: 'text/html; charset=utf-8', js: 'text/javascript; charset=utf-8', css: 'text/css; charset=utf-8', svg: 'image/svg+xml', png: 'image/png',
  jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', ico: 'image/x-icon', woff: 'font/woff', woff2: 'font/woff2' }
try {
  // Non-forwarding proxy + unroutable browser DNS guard browser APIs outside Playwright routing.
  proxy = createServer((_req, res) => { res.writeHead(403); res.end() })
  proxy.on('connect', (_req, socket) => socket.end('HTTP/1.1 403 Forbidden\r\n\r\n'))
  proxy.on('upgrade', (_req, socket) => socket.destroy())
  await new Promise((done, reject) => { proxy.once('error', reject); proxy.listen(0, '127.0.0.1', done) })
  process.send?.({ phase: 'BROWSER_STARTING' })
  browserServer = await chromium.launchServer({ host: '127.0.0.1', headless: true, timeout: 5000,
    proxy: { server: 'http://127.0.0.1:' + proxy.address().port, bypass: '<-loopback>' },
    args: ['--disable-quic', '--disable-background-networking', '--disable-extensions',
      '--force-webrtc-ip-handling-policy=disable_non_proxied_udp',
      '--disable-features=WebTransport,Prerender2,SpeculationRulesPrefetch',
      '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1'] })
  process.send?.({ browserPid: browserServer.process().pid })
  const browser = await chromium.connect(browserServer.wsEndpoint(), { timeout: 5000 })
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, serviceWorkers: 'block', acceptDownloads: false })
  await context.addInitScript(() => {
    for (const name of ['RTCPeerConnection', 'webkitRTCPeerConnection', 'WebTransport'])
      Object.defineProperty(globalThis, name, { value: undefined, writable: false, configurable: false })
  })
  await context.routeWebSocket('**/*', socket => { blocked = true; socket.close() })
  let page
  await context.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url())
    const main = request.isNavigationRequest() && request.frame() === page?.mainFrame()
    const path = main && url.pathname === '/' ? '/index.html' : url.pathname
    if (url.origin !== origin.origin || url.username || url.password || url.search || url.hash ||
        request.method() !== 'GET' || request.isNavigationRequest() && (!main || url.pathname !== '/') ||
        !job.files.some(file => '/' + file.path === path)) {
      blocked = true; await route.abort('blockedbyclient'); return
    }
    try {
      const body = await asset(path)
      await route.fulfill({ status: 200, body, headers: { 'Content-Type': mime[path.split('.').at(-1)] ?? 'application/octet-stream',
        'Content-Security-Policy': CSP, 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' } })
    } catch { failed = true; await route.abort('failed').catch(() => {}) }
  })
  page = await context.newPage()
  page.on('pageerror', () => { failed = true })
  page.on('popup', popup => { blocked = true; void popup.close() })
  page.on('download', download => { blocked = true; void download.cancel() })
  const response = await page.goto(job.url, { waitUntil: 'networkidle', timeout: Math.max(1, job.deadline - Date.now() - 1000) })
  if (!response || response.status() !== 200 || blocked || failed) throw new Error('CAPTURE_FAILED')
  // A screenshot of an empty/hidden document is not a usable cover.
  if (!await page.locator('body').innerText().then(text => text.trim().length > 0) && !await page.locator('img').count()) throw new Error('CAPTURE_FAILED')
  const png = await page.screenshot({ type: 'png', fullPage: false, animations: 'disabled', caret: 'hide', timeout: 2000 })
  if (blocked || failed || png.length > 6 * 1024 * 1024) throw new Error('CAPTURE_FAILED')
  result.status = 'SUCCEEDED'; result.failure = null; result.screenshot = png.toString('base64')
} catch { /* Only fixed failure codes cross the private worker boundary. */ }
finally {
  try { if (browserServer) await browserServer.close(); result.browserClosed = true }
  catch { result.status = 'FAILED'; result.failure = 'CLEANUP_FAILED'; result.screenshot = null }
  if (proxy) { proxy.closeAllConnections(); await new Promise(done => proxy.close(done)) }
}
return result
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  let input = ''
  for await (const chunk of process.stdin) { input += chunk; if (input.length > 768 * 1024) throw new Error('JOB_LIMIT') }
  const result = await capturePage(JSON.parse(input))
  process.stdout.write(JSON.stringify(result))
  process.exitCode = result.status === 'SUCCEEDED' ? 0 : 1
}
