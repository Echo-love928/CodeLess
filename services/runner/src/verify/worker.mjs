import { chromium, expect } from '@playwright/test'
import { locate, validateActions, limits as validateLimits } from './actions.mjs'
import { artifactFile, isDocumentRoute } from '../artifacts/routes.mjs'

const sendPhase = (phase) => process.send?.({ phase })
let input = ''
for await (const chunk of process.stdin) {
  input += chunk
  if (input.length > 100000) throw new Error('worker input limit exceeded')
}
const job = JSON.parse(input)
const actions = validateActions(job.actions)
const limits = validateLimits(job.limits)
const allowed = new Set(job.paths)
const diagnostics = { pageErrors: [], consoleErrors: [], blockedRequests: [], failedRequests: [], actions: [],
  truncated: false, freshContext: null, visibleContent: null, controlHost: null }
function record(key, value) {
  if (diagnostics[key].length < limits.diagnostics) diagnostics[key].push(value)
  else diagnostics.truncated = true
}
const short = (value) => String(value).slice(0, 512)
let phase = 'LAUNCH', server, browser, context, page, screenshot = null
const result = { status: 'FAILED', failure: null, phase, diagnostics, browserClosed: false }
function enter(value) { phase = value; sendPhase(value) }
try {
  enter('LAUNCH')
  server = await chromium.launchServer({ host: '127.0.0.1', headless: true, timeout: limits.launchTimeoutMs,
    // Proxy cannot forward any traffic; loopback targets must also pass through it.
    proxy: { server: job.origin, bypass: '<-loopback>' },
    args: ['--disable-quic', '--disable-background-networking', '--disable-extensions',
      '--force-webrtc-ip-handling-policy=disable_non_proxied_udp',
      '--disable-features=WebTransport,Prerender2,SpeculationRulesPrefetch',
      '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1'] })
  process.send?.({ browserPid: server.process().pid })
  diagnostics.controlHost = new URL(server.wsEndpoint()).hostname
  browser = await chromium.connect(server.wsEndpoint(), { timeout: limits.launchTimeoutMs })
  context = await browser.newContext({ viewport: { width: 1280, height: 720 },
    serviceWorkers: 'block', acceptDownloads: false, javaScriptEnabled: true })
  context.setDefaultTimeout(limits.actionTimeoutMs)
  context.setDefaultNavigationTimeout(limits.navigationTimeoutMs)
  await context.addInitScript(() => {
    // Defense for non-HTTP APIs, in every new document; no generated code is evaluated by the worker.
    for (const name of ['RTCPeerConnection', 'webkitRTCPeerConnection', 'WebTransport']) {
      Object.defineProperty(globalThis, name, { value: undefined, configurable: false, writable: false })
    }
  })
  await context.routeWebSocket('**/*', (socket) => {
    record('blockedRequests', { url: short(socket.url()), reason: 'WEBSOCKET' })
    socket.close({ code: 1008, reason: 'verification network policy' })
  })
  await context.route('**/*', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    const navigation = request.isNavigationRequest()
    const mainDocument = navigation && request.resourceType() === 'document' && request.frame() === page?.mainFrame()
    const path = artifactFile(url.pathname, mainDocument)
    const documentAllowed = !navigation || (mainDocument && isDocumentRoute(url.pathname))
    if (!navigation && request.url() === job.origin + '/favicon.ico' && !allowed.has('favicon.ico')) return route.fulfill({ status: 204 })
    if (url.protocol !== 'http:' || url.origin !== job.origin || url.username || url.password ||
        /%|\\/.test(url.pathname) || !allowed.has(path) || !documentAllowed ||
        !['GET', 'HEAD'].includes(request.method())) {
      record('blockedRequests', { url: short(request.url()), reason: 'ORIGIN_PATH_METHOD_OR_NAVIGATION' })
      return route.abort('blockedbyclient')
    }
    await route.continue({ headers: { ...request.headers(), 'x-codeless-artifact-token': job.token } })
  })
  context.on('page', (newPage) => {
    if (page && newPage !== page) {
      record('blockedRequests', { url: short(newPage.url()), reason: 'POPUP' })
      newPage.close().catch(() => {})
    }
  })
  page = await context.newPage()
  page.on('pageerror', (error) => record('pageErrors', short(error.message)))
  page.on('console', (message) => {
    if (message.type() === 'error') {
      record('consoleErrors', short(message.text()))
      if (/Content Security Policy|content security policy|violates.*directive/.test(message.text())) {
        record('blockedRequests', { url: short(message.text()), reason: 'CSP' })
      }
    }
  })
  page.on('requestfailed', (request) => record('failedRequests',
    { url: short(request.url()), reason: short(request.failure()?.errorText) }))
  page.on('response', (response) => {
    if (response.status() >= 400) record('failedRequests', { url: short(response.url()), reason: 'HTTP_' + response.status() })
  })
  page.on('download', (download) => {
    record('blockedRequests', { url: short(download.url()), reason: 'DOWNLOAD' })
    download.cancel().catch(() => {})
  })
  page.on('framenavigated', (frame) => {
    if (frame === page.mainFrame() && frame.url() !== 'about:blank') {
      const url = new URL(frame.url())
      if (url.origin !== job.origin) record('blockedRequests', { url: short(frame.url()), reason: 'NAVIGATION' })
    }
  })
  diagnostics.freshContext = { cookies: (await context.cookies()).length, pages: context.pages().length }
  enter('PAGE_OPEN')
  const response = await page.goto(job.origin + '/', { waitUntil: 'load', timeout: limits.navigationTimeoutMs })
  if (!response || response.status() !== 200) throw new Error('page did not load successfully')
  // Fixed host-authored visibility probe. User actions never supply evaluation code.
  enter('CONTENT')
  const hasContent = () => page.evaluate(() => {
    const root = document.getElementById('app')
    if (!root) return false
    const visible = (element) => element.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }) &&
      element.getBoundingClientRect().width > 0 && element.getBoundingClientRect().height > 0
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (node.textContent.trim() && visible(node.parentElement)) {
        const range = document.createRange()
        range.selectNodeContents(node)
        if (range.getBoundingClientRect().width > 0 && range.getBoundingClientRect().height > 0) return true
      }
    }
    return [...root.querySelectorAll('img')].some((element) => visible(element) && element.naturalWidth > 0)
  })
  diagnostics.visibleContent = await hasContent()
  enter('ACTION')
  for (const [index, action] of actions.entries()) {
    const locator = action.target ? locate(page, action.target) : null
    if (action.type === 'click') await locator.click()
    if (action.type === 'fill') await locator.fill(action.value)
    if (action.type === 'select') await locator.selectOption(action.value)
    if (action.type === 'check') await locator.check()
    if (action.type === 'reload') await page.reload({ waitUntil: 'load' })
    if (action.type === 'navigate') await page.goto(job.origin + action.path, { waitUntil: 'load' })
    if (action.type === 'expectVisible') await locator.waitFor({ state: 'visible' })
    if (action.type === 'expectText') {
      await locator.waitFor({ state: 'visible' })
      await expect(locator).toHaveText(action.value, { timeout: limits.actionTimeoutMs, useInnerText: true })
    }
    record('actions', { index, type: action.type, status: 'PASSED' })
  }
  enter('OBSERVE')
  await new Promise((done) => setTimeout(done, limits.observationMs))
  enter('CONTENT')
  diagnostics.visibleContent = await hasContent()
  enter('SCREENSHOT')
  screenshot = (await page.screenshot({ type: 'png', fullPage: false, timeout: limits.screenshotTimeoutMs,
    animations: 'disabled', caret: 'hide' })).toString('base64')
  result.failure = diagnostics.blockedRequests.length ? 'NETWORK_BLOCKED' :
    diagnostics.pageErrors.length ? 'PAGE_EXCEPTION' : diagnostics.consoleErrors.length ? 'CONSOLE_ERROR' :
    diagnostics.failedRequests.length ? 'RESOURCE_FAILED' : !diagnostics.visibleContent ? 'BLANK_PAGE' : null
  result.status = result.failure ? 'FAILED' : 'PASSED'
} catch (error) {
  result.failure = error.name === 'TimeoutError' ? phase + '_TIMEOUT' :
    phase === 'ACTION' ? 'ACTION_FAILED' : phase === 'LAUNCH' ? 'BROWSER_UNAVAILABLE' : 'BROWSER_ERROR'
  result.error = short(error.message)
} finally {
  result.phase = phase
  enter('CLEANUP')
  if (server) {
    try {
      await server.close()
      result.browserClosed = true
    } catch (error) { result.failure = 'CLEANUP_FAILED'; result.status = 'FAILED'; result.error = short(error.message) }
  }
}
process.stdout.write(JSON.stringify({ ...result, screenshot }))
// Parent validates the real exit code independently from the browser's verdict.
process.exitCode = result.status === 'PASSED' ? 0 : 1
