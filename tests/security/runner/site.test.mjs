import assert from 'node:assert/strict'
import { test } from 'node:test'
import { chromium } from '@playwright/test'
import { stripTypeScriptTypes } from 'node:module'
import { spawnSync } from 'node:child_process'
import { mkdtemp, mkdir, writeFile, readFile, chmod, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import { createPreviewGateway } from '../../../services/runner/src/preview/gateway.mjs'
import { openArtifactService } from '../../../services/runner/src/artifacts/service.mjs'
import { hostingConfig } from '../../../infra/hosting/render.mjs'
import { previewOrigins } from '../../../services/runner/src/preview/credentials.mjs'
import { publicationSite } from '../../../services/runner/src/publish/policy.mjs'
import { completedFixture } from '../../runner/browser/fixtures.mjs'
import { tlsServer, closeServer, signed, passedFixture, KEY_HEX } from '../../e2e/preview/fixtures.mjs'
import { evidence } from './evidence.mjs'
function docker(args) {
  const result = spawnSync('docker', args, { encoding: 'utf8', windowsHide: true, timeout: 60000 })
  assert.equal(result.status, 0, result.stderr); return result.stdout.trim()
}
test('D19 T3/T4: real preview gateway and HTTPS nginx isolate credentials, CSP, messages and hosting paths', { timeout: 60000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), 'codeless-d19-sites-')), name = 'codeless-d19-' + randomUUID()
  let tls, gateway, handle, browser, created = false, platform, preview
  const cookieHeaders = [], violations = [], version = randomUUID(), app = randomUUID(), deployment = randomUUID()
  try {
    const sites = join(root, 'sites'), directory = join(sites, deployment), artifacts = join(root, 'artifacts')
    await mkdir(join(directory, 'assets'), { recursive: true }); await mkdir(artifacts)
    const fixture = await completedFixture(artifacts, { js: 'document.querySelector("h1").textContent="Preview fixture"' })
    handle = await openArtifactService({ artifactRoot: artifacts, ...fixture })
    // Local platform identity and auth are explicit fixtures; both site servers and browser are real.
    const sessionSource = stripTypeScriptTypes(await readFile('apps/web/src/features/visual-edit/selector-session.ts', 'utf8'))
    tls = await tlsServer(join(root, 'tls'), (req, res) => {
      if (req.headers.host === new URL(platform).host) {
        res.writeHead(200, { 'Content-Type': req.url === '/session.js' ? 'text/javascript' : 'text/html; charset=utf-8' })
        return res.end(req.url === '/session.js' ? sessionSource : '<!doctype html><h1>Platform fixture</h1><div id="frames"></div>')
      }
      cookieHeaders.push(req.headers.cookie ?? '')
      gateway.server.emit('request', req, res)
    })
    const port = tls.address().port
    platform = 'https://platform.codeless.test:' + port
    preview = 'https://preview.codeless-preview.test:' + port
    const previewUrl = preview.replace('https://', 'https://v' + version.replaceAll('-', '') + '.')
    gateway = createPreviewGateway({ signingKeyHex: KEY_HEX, platformOrigin: platform, previewOrigin: preview })
    await new Promise(done => gateway.server.listen(0, '127.0.0.1', done))
    gateway.register({ applicationId: app, versionId: version, handle, verification: passedFixture(handle) })
    await writeFile(join(directory, 'index.html'), '<!doctype html><h1>Public fixture</h1><script>window.inlineExecuted=true</script><script src="/assets/app.js"></script>')
    await writeFile(join(directory, 'assets/app.js'), 'document.body.dataset.executed="yes"')
    await writeFile(join(directory, '__deployment.json'), '{"private":"receipt"}')
    await writeFile(join(root, 'nginx.conf'), await hostingConfig({ publicOrigin: 'https://sites.codeless-public.test', platformOrigin: platform, previewOrigin: preview }))
    await chmod(join(root, 'tls/test-key.pem'), 0o644) // disposable fixture key only
    docker(['run', '-d', '--name', name, '--read-only', '--user', '101:101', '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges',
      '--pids-limit', '64', '--memory', '128m', '--cpus', '0.5', '--tmpfs', '/var/cache/nginx:uid=101,gid=101,mode=0700',
      '--tmpfs', '/var/run:uid=101,gid=101,mode=0700', '-p', '127.0.0.1::8443',
      '--mount', `type=bind,source=${sites},target=/sites,readonly`, '--mount', `type=bind,source=${join(root, 'nginx.conf')},target=/etc/nginx/conf.d/default.conf,readonly`,
      '--mount', `type=bind,source=${join(root, 'tls/test-cert.pem')},target=/certs/server.pem,readonly`,
      '--mount', `type=bind,source=${join(root, 'tls/test-key.pem')},target=/certs/server.key,readonly`, 'nginx:1.27.5-alpine'])
    created = true; docker(['exec', name, 'nginx', '-t'])
    const publicPort = JSON.parse(docker(['inspect', name]))[0].NetworkSettings.Ports['8443/tcp'][0].HostPort
    const publicUrl = 'https://d' + deployment.replaceAll('-', '') + '.sites.codeless-public.test:' + publicPort
    browser = await chromium.launch({ args: ['--host-resolver-rules=MAP *.test 127.0.0.1', '--no-proxy-server'] })
    const context = await browser.newContext({ ignoreHTTPSErrors: true,
      // Local fixtures bypass inherited OS/browser proxy configuration. Every
      // other destination fails through the non-forwarding proxy and route below.
      proxy: { server: 'http://127.0.0.1:9', bypass: '*.test,127.0.0.1' } }) // local self-signed fixture, no public TLS claim
    await context.route('**/*', route => [platform, previewUrl, publicUrl].includes(new URL(route.request().url()).origin) ? route.continue() : route.abort())
    await context.addCookies([{ name: 'JSESSIONID', value: 'd19-platform-session', url: platform, secure: true, httpOnly: true, sameSite: 'Lax' },
      { name: 'platform-marker', value: 'd19-marker', url: platform, secure: true }])
    const page = await context.newPage(), cspMessages = []
    page.on('console', message => cspMessages.push(message.text()))
    await page.goto(platform)
    await page.evaluate(() => { localStorage.setItem('platform-secret', 'd19-private'); sessionStorage.setItem('platform-secret', 'd19-session') })
    const token = signed(handle, app, version)
    await page.evaluate(({ previewUrl, token, publicUrl }) => {
      for (const [id, src] of [['preview', previewUrl + '/__preview/start?credential=' + token], ['public', publicUrl + '/']]) {
        const frame = document.createElement('iframe'); frame.id = id; frame.src = src
        if (id === 'preview') frame.sandbox = 'allow-scripts allow-same-origin'
        document.querySelector('#frames').append(frame)
      }
    }, { previewUrl, token, publicUrl })
    const frame = page.frameLocator('#preview')
    await frame.getByRole('heading', { name: 'Preview fixture' }).waitFor()
    // Public CSP deliberately forbids iframe embedding. Visit it in a separate top-level page.
    const popup = page.waitForEvent('popup')
    await page.evaluate(() => { window.open('about:blank', 'd19-public') })
    const publicPage = await popup, response = await publicPage.goto(publicUrl)
    assert.equal(response.status(), 200)
    await publicPage.waitForFunction(() => document.body.dataset.executed === 'yes')
    assert.equal(await publicPage.evaluate(() => window.inlineExecuted), undefined)
    assert.match(response.headers()['content-security-policy'], /frame-ancestors 'none'/)
    assert.ok(cspMessages.some(message => /frame-ancestors/.test(message)), 'public CSP must actually reject embedding')
    const probe = () => {
      const errors = []
      for (const read of [() => parent.localStorage.getItem('platform-secret'), () => parent.document.cookie])
        try { read(); errors.push('unexpected-access') } catch (error) { errors.push(error.name) }
      return { errors, cookie: document.cookie, storage: localStorage.getItem('platform-secret'), session: sessionStorage.getItem('platform-secret') }
    }
    const previewRead = await frame.locator('body').evaluate(probe)
    assert.deepEqual(previewRead.errors, ['SecurityError', 'SecurityError'])
    const publicRead = await publicPage.evaluate(() => {
      const errors = []
      for (const read of [() => opener.localStorage.getItem('platform-secret'), () => opener.document.cookie])
        try { read(); errors.push('unexpected-access') } catch (error) { errors.push(error.name) }
      return { errors, cookie: document.cookie, storage: localStorage.getItem('platform-secret'), session: sessionStorage.getItem('platform-secret') }
    })
    assert.deepEqual(publicRead.errors, ['SecurityError', 'SecurityError'])
    for (const result of [previewRead, publicRead]) { assert.equal(result.storage, null); assert.equal(result.session, null); assert.doesNotMatch(result.cookie, /d19-platform|d19-marker|codeless-preview/) }
    assert.ok(cookieHeaders.length > 0); assert.ok(cookieHeaders.every(header => !header.includes('JSESSIONID') && !header.includes('platform-marker')))
    // Native postMessage from the real bridge establishes the production session.
    await page.evaluate(async ({ previewUrl, version }) => {
      const { createSelectorSession } = await import('/session.js')
      window.selections = []; window.ready = false; window.replayDeliveries = 0; window.expectedReplay = null
      window.session = createSelectorSession({ frame: document.querySelector('#preview').contentWindow, origin: previewUrl, versionId: version,
        onSelection: value => { if (value) window.selections.push(value) }, onExit() {}, onReady() { window.ready = true } })
      addEventListener('message', event => {
        window.session.receive(event)
        // Count only the exact replay from this preview after receive has run.
        // Counting does not depend on whether the session accepts the message.
        if (event.source === document.querySelector('#preview').contentWindow && event.origin === previewUrl &&
            window.expectedReplay && JSON.stringify(event.data) === JSON.stringify(window.expectedReplay)) window.replayDeliveries++
      }); window.session.probe()
    }, { previewUrl, version })
    await page.waitForFunction(() => window.ready)
    await page.evaluate(() => window.session.mode(true))
    // Exact protocol checks are exercised with the session's actual init nonce captured below.
    await frame.locator('body').evaluate(() => { window.commands = []; addEventListener('message', event => window.commands.push(event.data)) })
    await page.evaluate(() => window.session.mode(true))
    const command = await frame.locator('body').evaluate(() => new Promise(done => {
      const command = window.commands.findLast(value => value?.type === 'mode')
      if (command) return done(command)
      addEventListener('message', function listen(event) {
        if (event.data?.type === 'mode') { removeEventListener('message', listen); done(event.data) }
      })
    }))
    assert.ok(command)
    const { enabled, ...base } = command; void enabled
    const selection = { ...base, type: 'selection', componentId: 'home-page', instance: { index: 1, count: 1 } }
    await page.evaluate(({ selection, previewUrl }) => {
      const source = document.querySelector('#preview').contentWindow
      for (const patch of [{ nonce: crypto.randomUUID() }, { sourceDigest: 'sha256:' + '0'.repeat(64) }, { sourceFile: '../secret' }, { instance: { index: 2, count: 1 } }])
        dispatchEvent(new MessageEvent('message', { source, origin: previewUrl, data: { ...selection, ...patch } }))
      dispatchEvent(new MessageEvent('message', { source: window, origin: previewUrl, data: selection }))
      dispatchEvent(new MessageEvent('message', { source, origin: previewUrl + '.evil', data: selection }))
    }, { selection, previewUrl })
    assert.equal(await page.evaluate(() => window.selections.length), 0)
    await frame.locator('body').evaluate((_node, selection) => parent.postMessage(selection, '*'), selection)
    await page.waitForFunction(() => window.selections.length === 1)
    await page.evaluate(selection => { window.expectedReplay = selection; window.replayDeliveries = 0 }, selection)
    await page.evaluate(() => window.session.close())
    await frame.locator('body').evaluate((_node, selection) => parent.postMessage(selection, '*'), selection)
    await page.waitForFunction(() => window.replayDeliveries === 1)
    assert.equal(await page.evaluate(() => window.selections.length), 1, 'delivered replay after close must not select')
    for (const path of ['/__deployment.json', '/.env', '/.git/config', '/assets/../__deployment.json', '/assets/missing.js', '/api/v0/admin']) {
      const result = await publicPage.goto(publicUrl + path); assert.equal(result.status(), 404, path); violations.push({ path, status: result.status() })
    }
    assert.throws(() => previewOrigins(platform, platform), /separate/)
    assert.throws(() => publicationSite('https://public.codeless.test', platform, preview), /separate/)
    await evidence('T3-T4-site-boundaries', { previewRead, publicRead, credentialLeaksAtGateway: 0, rejectedMessages: 6, acceptedMessages: 1,
      closedSessionReplayDeliveries: await page.evaluate(() => window.replayDeliveries), closedSessionReplayRejected: true,
      publicInlineScriptBlocked: true, publicEmbeddingBlocked: true, publicCsp: response.headers()['content-security-policy'], violations, transport: 'LOCAL_TLS_FIXTURE_REAL_GATEWAY_NGINX_CHROMIUM' })
  } finally {
    if (browser) await browser.close()
    if (tls) await closeServer(tls)
    if (gateway) await gateway.close()
    if (handle) await handle.close()
    if (created) docker(['rm', '-f', name])
    assert.equal(dirname(root), resolve(tmpdir())); await rm(root, { recursive: true, force: true })
  }
})
