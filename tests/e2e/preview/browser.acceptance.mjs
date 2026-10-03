import { test } from 'node:test'
import { expect } from '@playwright/test'
import { randomUUID } from 'node:crypto'
import { mkdir, writeFile, readFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { chromium } from '@playwright/test'
import application from '../../../contracts/examples/v0/valid/application.json' with { type: 'json' }
async function installMockAuth(page) {
  let user = null
  await page.route('**/api/v0/auth/**', route => {
    const path = new URL(route.request().url()).pathname
    const json = (status, body) => route.fulfill({status, contentType: 'application/json', body: JSON.stringify(body)})
    if (path.endsWith('/csrf')) return json(200, {token: 'test-csrf-token'})
    if (path.endsWith('/login')) { user = {id: 'user-1', email: 'demo@codeless.local', displayName: '演示用户', role: 'USER'}; return json(200, user) }
    if (path.endsWith('/me')) return json(user ? 200 : 401, user || {code: 'UNAUTHENTICATED'})
    return json(404, {})
  })
  await page.route('**/api/v0/applications?**', route => route.fulfill({status: 200, contentType: 'application/json',
    body: JSON.stringify({items: [], page: 0, size: 20, total: 0})}))
}
async function loginAsDemo(page) {
  await page.goto('/login')
  await page.getByLabel('邮箱').fill('demo@codeless.local')
  await page.getByLabel('密码').fill('good-password')
  await page.getByRole('button', {name: '登录'}).click()
  await expect(page).toHaveURL(/\/apps$/)
}

import { createBuildRunner } from '../../../services/runner/src/build/runner.mjs'
import { createBrowserVerifier } from '../../../services/runner/src/verify/verifier.mjs'
import { readSnapshot } from '../../../services/runner/src/artifacts/snapshot.mjs'
import { spawnSync } from 'node:child_process'
import { openArtifactService } from '../../../services/runner/src/artifacts/service.mjs'
import { createPreviewGateway } from '../../../services/runner/src/preview/gateway.mjs'
import { KEY_HEX, signed, tlsServer, closeServer } from './fixtures.mjs'

test('D09-B-T1/T3/T4: real Vue build and Chromium preview, platform isolation and version refresh', { timeout: 110_000 }, async (t) => {
  const root = process.cwd()
  const evidence = resolve(process.env.CODELESS_PREVIEW_EVIDENCE_DIR || join(root, '.local-data/d09-b/preview-evidence'))
  await mkdir(evidence, { recursive: true })
  const artifactRoot = join(evidence, 'artifacts')
  // Own tag pins this test's immutable image while D08 rebuilds its shared default tag.
  const imageTag = 'codeless-d09-preview-test:' + randomUUID()
  const imageBuild = spawnSync('docker', ['build', '--file', 'infra/build-image/Dockerfile', '--tag', imageTag, '.'],
    { cwd: root, encoding: 'utf8', timeout: 70_000, windowsHide: true })
  expect(imageBuild.status, imageBuild.stderr).toBe(0)
  t.after(() => { const cleanup = spawnSync('docker', ['image', 'rm', imageTag], { encoding: 'utf8', windowsHide: true }); expect(cleanup.status, cleanup.stderr).toBe(0) })
  const inspected = spawnSync('docker', ['image', 'inspect', imageTag, '--format', '{{.Id}}'], { encoding: 'utf8', windowsHide: true })
  expect(inspected.status, inspected.stderr).toBe(0)
  const build = await createBuildRunner({ workRoot: join(evidence, 'work'), artifactRoot, imageId: inspected.stdout.trim() })
  const verify = await createBrowserVerifier({ evidenceRoot: join(evidence, 'verification') })
  const run = async source => {
    const snapshot = await readSnapshot(source, { source: true, files: 40, bytes: 512 * 1024, fileBytes: 128 * 1024 })
    const observedBuild = await build(source)
    if (observedBuild.status !== 'SUCCEEDED') return { status: 'FAILED', build: observedBuild, verification: null }
    const handle = await openArtifactService({ artifactRoot, build: observedBuild, sourceDigest: snapshot.manifest.digest })
    try { const verification = await verify(handle); return { status: verification.status === 'PASSED' ? 'VERIFIED' : 'FAILED',
      build: observedBuild, verification, sourceDigest: snapshot.manifest.digest } }
    finally { await handle.close() }
  }
  const first = await run(join(root, 'templates/vue/fixtures/showcase'))
  const source2 = join(evidence, 'source-version-two')
  await mkdir(join(source2, 'src/pages'), { recursive: true })
  const changed = (await readFile(join(root, 'templates/vue/fixtures/showcase/src/pages/HomePage.vue'), 'utf8')).replace('个人展示', '搜索分类').replace('林予安', '版本二')
  await writeFile(join(source2, 'src/pages/HomePage.vue'), changed)
  const second = await run(source2)
  expect(first.status, JSON.stringify(first)).toBe('VERIFIED')
  expect(second.status, JSON.stringify(second)).toBe('VERIFIED')
  const firstHandle = await openArtifactService({ artifactRoot, build: first.build, sourceDigest: first.sourceDigest })
  const secondHandle = await openArtifactService({ artifactRoot, build: second.build, sourceDigest: second.sourceDigest })
  let handler
  let gateway
  let browser
  const tls = await tlsServer(join(evidence, 'tls'), (request, response) => handler?.(request, response))
  const port = tls.address().port
  const platformOrigin = 'https://platform.codeless.test:' + port
  const previewOrigin = 'https://preview.codeless-preview.test:' + port
  const appId = application.id, version1 = randomUUID(), version2 = randomUUID()
  let current = version1, clock = Date.now(), issues = 0, platformProbeHits = 0
  const observed = []
  gateway = createPreviewGateway({ signingKeyHex: KEY_HEX, previewOrigin, platformOrigin, now: () => clock })
  gateway.register({ applicationId: appId, versionId: version1, handle: firstHandle, verification: first.verification })
  gateway.register({ applicationId: appId, versionId: version2, handle: secondHandle, verification: second.verification })
  handler = async (request, response) => {
    if (request.headers.host === new URL(platformOrigin).host) {
      if (request.url === '/probe') { platformProbeHits++; response.writeHead(200); return response.end('platform-private') }
      try {
        const upstream = await fetch('http://127.0.0.1:4173' + request.url)
        response.writeHead(upstream.status, { 'Content-Type': upstream.headers.get('content-type') || 'text/html', 'Cache-Control': 'no-store' })
        response.end(Buffer.from(await upstream.arrayBuffer()))
      } catch { response.writeHead(502); response.end() }
    } else {
      observed.push({ platformCookie: (request.headers.cookie || '').includes('JSESSIONID='),
        forwardedSecret: Boolean(request.headers.authorization || request.headers['x-codeless-artifact-token']) })
      gateway.server.emit('request', request, response)
    }
  }
  try {
    browser = await chromium.launch({ args: ['--host-resolver-rules=MAP *.codeless.test 127.0.0.1, MAP *.codeless-preview.test 127.0.0.1', '--no-proxy-server'] })
    const context = await browser.newContext({ baseURL: platformOrigin, ignoreHTTPSErrors: true,
      // Test context only: fixed local TLS hosts bypass system proxy; every other destination fails closed.
      proxy: { server: 'http://127.0.0.1:9', bypass: '*.codeless.test,*.codeless-preview.test,127.0.0.1' } })
    const page = await context.newPage()
    await installMockAuth(page)
    // Explicit platform auth/metadata/credential fixture. Gateway, builds, D08 verification and Chromium are real.
    await page.route('**/api/v0/applications/' + appId, route => route.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify({ ...application, status: 'ACTIVE', baseVersionId: version1, latestReadyVersionId: current }) }))
    await page.route('**/preview-credentials', route => {
      issues++
      expect(route.request().headers()['x-csrf-token']).toBe('test-csrf-token')
      const version = route.request().url().split('/versions/')[1].split('/')[0]
      const handle = version === version1 ? firstHandle : secondHandle
      const url = previewOrigin.replace('https://', 'https://v' + version.replaceAll('-', '') + '.') +
        '/__preview/start?credential=' + signed(handle, appId, version, clock)
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
        applicationId: appId, versionId: version, url, expiresAt: new Date(Date.now() + 120_000).toISOString(),
      }) })
    })
    await loginAsDemo(page)
    await context.addCookies([
      { name: 'JSESSIONID', value: 'platform-session-only', url: platformOrigin, httpOnly: true, secure: true, sameSite: 'Lax' },
      { name: 'platform-marker', value: 'platform-readable-cookie', url: platformOrigin, secure: true },
    ])
    await page.evaluate(() => { localStorage.setItem('platform-secret', 'private'); sessionStorage.setItem('platform-secret', 'private-session') })
    await page.goto('/workbench/' + appId)
    const iframe = page.locator('iframe[title="当前版本预览"]')
    await expect(iframe).toBeVisible()
    const frame = page.frameLocator('iframe[title="当前版本预览"]')
    await expect(frame.locator('#app')).toContainText('展示')
    const text1 = await frame.locator('#app').innerText()
    expect(await iframe.getAttribute('sandbox')).toBe('allow-scripts allow-same-origin')
    await expect(iframe).toHaveAttribute('referrerpolicy', 'no-referrer')
    let popupCount = 0
    page.on('popup', () => { popupCount++ })
    const isolation = await frame.locator('#app').evaluate((_element, platform) => {
      const errors = []
      for (const read of [() => parent.localStorage.getItem('platform-secret'), () => parent.sessionStorage.getItem('platform-secret'),
        () => parent.document.cookie]) { try { read(); errors.push('unexpected-access') } catch (error) { errors.push(error.name) } }
      let topNavigation = ''
      try { top.location.href = platform + '/probe' } catch (error) { topNavigation = error.name }
      const popup = window.open(platform + '/probe')
      void fetch(platform + '/probe').catch(() => {})
      localStorage.setItem('preview-only', 'preview-value')
      return { errors, cookie: document.cookie, platformStorage: localStorage.getItem('platform-secret'), topNavigation, popupBlocked: popup === null }
    }, platformOrigin)
    expect(isolation.errors).toEqual(['SecurityError', 'SecurityError', 'SecurityError'])
    expect(isolation.cookie).not.toContain('platform-')
    expect(isolation.cookie).not.toContain('codeless-preview')
    expect(isolation.platformStorage).toBeNull()
    expect(isolation.popupBlocked).toBe(true)
    expect(isolation.topNavigation).toBe('SecurityError')
    expect(platformProbeHits).toBe(0)
    expect(popupCount).toBe(0)
    const cookies = await context.cookies()
    const previewCookie = cookies.find(cookie => cookie.name === '__Host-codeless-preview')
    expect(previewCookie?.httpOnly).toBe(true); expect(previewCookie?.secure).toBe(true)
    expect(previewCookie?.domain).toContain(version1.replaceAll('-', ''))
    expect(observed.every(item => !item.platformCookie && !item.forwardedSecret)).toBe(true)
    await page.screenshot({ path: join(evidence, 'T1-T3-platform-preview.png'), fullPage: true })


    // Real client-side resource interruption must show an error despite a subsequent load event.
    let breakResource = true
    await page.route('**/assets/*.js', route => {
      const uri = new URL(route.request().url())
      if (breakResource && uri.hostname === 'v' + version1.replaceAll('-', '') + '.preview.codeless-preview.test')
        return route.abort('failed')
      return route.continue()
    })
    await page.getByRole('button', { name: '刷新预览', exact: true }).click()
    await expect(page.getByRole('alert')).toContainText('预览凭据失效或产物不可用')
    breakResource = false
    await page.getByRole('button', { name: '刷新预览', exact: true }).click()
    await expect(frame.locator('#app')).toContainText('展示')
    // Actual iframe document refresh preserves this immutable version and its isolated generated storage.
    await iframe.evaluate((element) => { element.contentWindow.postMessage('ignored', '*') })
    await page.frames().find(item => item.url().startsWith(previewOrigin.replace('https://', 'https://v' + version1.replaceAll('-', '') + '.')))
      .evaluate(() => location.reload())
    await expect(frame.locator('#app')).toContainText('展示')
    expect(await frame.locator('#app').evaluate(() => localStorage.getItem('preview-only'))).toBe('preview-value')
    // A new ready version is read through the workbench refresh hook and served on a different origin.
    current = version2
    await page.getByRole('button', { name: '刷新预览', exact: true }).click()
    await expect(iframe).toHaveAttribute('src', new RegExp(version2.replaceAll('-', '')))
    await expect(frame.locator('#app')).toContainText('分类')
    const text2 = await frame.locator('#app').innerText()
    expect(text2).not.toBe(text1)
    expect(await frame.locator('#app').evaluate(() => localStorage.getItem('preview-only'))).toBeNull()
    await page.reload()
    await expect(frame.locator('#app')).toContainText('分类')
    // Every resource remains denied after expiry, including an iframe navigation, with a visible refresh action.
    clock += 121_000
    await page.frames().find(item => item.url().includes(version2.replaceAll('-', '')))
      .evaluate(() => { location.href = '/tasks' })
    await expect(page.getByRole('alert')).toContainText('预览凭据失效')
    expect(platformProbeHits).toBe(0)
    clock = Date.now()
    await page.getByRole('button', { name: '刷新预览', exact: true }).click()
    await expect(frame.locator('#app')).toContainText('分类')
    await page.screenshot({ path: join(evidence, 'T4-current-version.png'), fullPage: true })
    await writeFile(join(evidence, 'acceptance.json'), JSON.stringify({
      task: 'D09-B', platformApiFixture: true, sourceFixture: true, generatedBuildFixture: false, browser: 'locked Chromium',
      T1: { status: 'PASSED', versionId: version1, buildId: first.build.id, artifactDigest: first.build.artifact.digest },
      T2: { status: 'PASSED', expiredNavigationRejected: true, resourceFailureRejected: true },
      T3: { status: 'PASSED', isolation, platformProbeHits, popupCount, noPlatformCookieAtGateway: observed.every(item => !item.platformCookie) },
      T4: { status: 'PASSED', versionId: version2, buildId: second.build.id, artifactDigest: second.build.artifact.digest, issues, changedText: text1 !== text2 },
    }, null, 2))
    await context.close()
  } finally {
    if (browser) await browser.close()
    await closeServer(tls)
    if (gateway) gateway.server.closeAllConnections()
    await firstHandle.close(); await secondHandle.close()
  }
})
