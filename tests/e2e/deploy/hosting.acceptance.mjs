import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { mkdir, readFile, writeFile, unlink } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { request } from 'node:https'
import { test } from 'node:test'
import { chromium } from '@playwright/test'
import { createBuildVerifier } from '../../../services/runner/src/verify/workflow.mjs'
import { openArtifactService } from '../../../services/runner/src/artifacts/service.mjs'
import { createPublisher } from '../../../services/runner/src/publish/publisher.mjs'
import { hostingConfig } from '../../../infra/hosting/render.mjs'
import { digest } from '../../../services/runner/src/artifacts/snapshot.mjs'

const repository = resolve('.'), evidence = resolve(process.env.CODELESS_DEPLOY_EVIDENCE_DIR ?? '.local-data/d15-b/hosting')
const origins = { publicOrigin: 'https://sites.codeless-public.test:8443', platformOrigin: 'https://app.codeless.test', previewOrigin: 'https://preview.codeless-preview.test' }
function docker(args, input) {
  const result = spawnSync('docker', args, { input, encoding: 'utf8', timeout: 60000, windowsHide: true })
  assert.equal(result.status, 0, JSON.stringify({ args: args.slice(0, 6), status: result.status, error: result.error?.message, stderr: result.stderr }))
  return result.stdout.trim()
}
test('D15-B-T1/T2/T3: real Docker/Vue/Chromium -> publication -> actual HTTPS Nginx and isolated access probe', { timeout: 160000 }, async () => {
  await mkdir(evidence, { recursive: true })
  const artifactRoot = join(evidence, 'artifacts'), evidenceRoot = join(evidence, 'verification'), hostingRoot = join(evidence, 'sites')
  await mkdir(hostingRoot, { recursive: true })
  const run = await createBuildVerifier({ workRoot: join(evidence, 'work'), artifactRoot, evidenceRoot })
  const observed = await run(join(repository, 'templates/vue/fixtures/tasks'))
  assert.equal(observed.status, 'VERIFIED', JSON.stringify(observed))
  const handle = await openArtifactService({ artifactRoot, build: observed.build, sourceDigest: observed.sourceDigest })
  const version = { id: randomUUID(), applicationId: randomUUID(), status: 'VERIFIED', buildId: observed.build.id, sourceDigest: observed.sourceDigest }
  const publish = await createPublisher({ hostingRoot, evidenceRoot, ...origins })
  const receipt = await publish({ deploymentId: randomUUID(), version, verification: observed.verification, handle })
  const token = randomUUID(), network = 'codeless-d15-' + token, container = network + '-hosting', probeName = network + '-probe'
  const cert = join(evidence, 'server.pem'), key = join(evidence, 'server.key'), config = join(evidence, 'nginx.conf')
  let openssl = 'openssl'
  if (process.platform === 'win32') openssl = resolve(dirname(execFileSync('where.exe', ['git'], { encoding: 'utf8' }).trim().split(/\r?\n/)[0]), '../usr/bin/openssl.exe')
  execFileSync(openssl, ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', key, '-out', cert, '-days', '1',
    '-subj', '/CN=codeless-public-test', '-addext', 'subjectAltName=DNS:*.sites.codeless-public.test'],
  { stdio: 'ignore', windowsHide: true, env: { ...process.env, MSYS_NO_PATHCONV: '1' } })
  await writeFile(config, await hostingConfig(origins))
  let browser, networkCreated = false, hostingCreated = false
  try {
    docker(['network', 'create', '--internal', network]); networkCreated = true
    docker(['run', '-d', '--name', container, '--network', 'bridge', '--read-only', '--user', '101:101', '--cap-drop', 'ALL',
      '--security-opt', 'no-new-privileges', '--pids-limit', '64', '--memory', '128m', '--cpus', '0.5',
      '--tmpfs', '/var/cache/nginx:uid=101,gid=101,mode=0700', '--tmpfs', '/var/run:uid=101,gid=101,mode=0700',
      '-p', '127.0.0.1::8443', '--mount', `type=bind,source=${hostingRoot},target=/sites,readonly`,
      '--mount', `type=bind,source=${config},target=/etc/nginx/conf.d/default.conf,readonly`,
      '--mount', `type=bind,source=${cert},target=/certs/server.pem,readonly`,
      '--mount', `type=bind,source=${key},target=/certs/server.key,readonly`, 'nginx:1.27.5-alpine']); hostingCreated = true
    docker(['network', 'connect', network, container])
    const inspect = JSON.parse(docker(['inspect', container]))[0]
    await writeFile(join(evidence, 'hosting-inspect.json'), JSON.stringify(inspect, null, 2))
    await writeFile(join(evidence, 'hosting-log.txt'), docker(['logs', container]))
    assert.equal(inspect.State.Running, true, JSON.stringify(inspect.State))
    docker(['exec', container, 'nginx', '-t'])
    const port = Number(inspect.NetworkSettings.Ports['8443/tcp'][0].HostPort), address = inspect.NetworkSettings.Networks[network].IPAddress
    const hostname = new URL(receipt.url).hostname
    const ca = await readFile(cert)
    async function get(path, host = hostname, method = 'GET') {
      return new Promise((done, reject) => {
        const req = request({ hostname: host, port, path, method, servername: hostname, ca,
          lookup: (_name, options, callback) => options.all
            ? callback(null, [{ address: '127.0.0.1', family: 4 }]) : callback(null, '127.0.0.1', 4), timeout: 3000 }, response => {
          const chunks = []; response.on('data', chunk => chunks.push(chunk)); response.on('error', reject)
          response.on('end', () => done({ path, status: response.statusCode, headers: response.headers, body: Buffer.concat(chunks) }))
        })
        req.on('error', reject); req.on('timeout', () => req.destroy(new Error('TLS fixture timeout'))); req.end()
      })
    }
    // Nginx readiness is checked by its real config validation, not an arbitrary startup retry loop.
    docker(['exec', container, 'nginx', '-t'])
    const index = receipt.files.find(file => file.path === 'index.html')
    const httpEvidence = []
    for (const path of ['/', '/tasks', '/catalog']) {
      const response = await get(path); assert.equal(response.status, 200)
      assert.equal(digest(response.body), index.digest)
      httpEvidence.push({ path, status: response.status, digest: digest(response.body), type: response.headers['content-type'] })
    }
    for (const path of ['/assets/missing.js', '/assets/', '/src/pages/HomePage.vue', '/ai-component-catalog.json', '/__deployment.json', '/.git/config', '/assets/missing.js.map', '/api/v0/publications', '/unknown', '/assets/../__deployment.json']) {
      const response = await get(path); assert.equal(response.status, 404, path)
      assert.equal(response.headers['content-type']?.includes('text/html'), false, path)
      assert.equal(response.body.toString().includes('src/pages'), false)
      httpEvidence.push({ path, status: response.status, type: response.headers['content-type'] })
    }
    // Nginx rejects this invalid URI before location dispatch. Assert the exact parse rejection;
    // required missing-resource 404 assertions above remain strict and must never return HTML.
    const malformed = await get('/%2e%2e/src/pages/HomePage.vue')
    assert.equal(malformed.status, 400)
    assert.equal(malformed.body.toString().includes('src/pages'), false)
    httpEvidence.push({ path: malformed.path, status: malformed.status, parseRejected: true })
    assert.equal((await get('/', 'd' + '0'.repeat(32) + '.sites.codeless-public.test')).status, 404)
    assert.equal((await get('/', hostname, 'POST')).status, 405)
    const probeArgs = ['run', '--rm', '-i', '--name', probeName, '--network', network, '--read-only', '--user', '10001:10001',
      '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges', '--pids-limit', '32', '--memory', '128m', '--cpus', '0.5',
      '--mount', `type=bind,source=${join(repository, 'services/runner/src/publish')},target=/probe,readonly`,
      '--mount', `type=bind,source=${join(repository, 'tests/e2e/deploy/probe-fixture.mjs')},target=/fixture.mjs,readonly`,
      '--mount', `type=bind,source=${cert},target=/certs/server.pem,readonly`, 'node:24.16.0-bookworm-slim', 'node', '/fixture.mjs']
    const probe = JSON.parse(docker(probeArgs, JSON.stringify({ url: receipt.url, address, files: receipt.files })))
    assert.equal(probe.status, 'PASSED')
    // The production entry point rejects this private fixture even inside the same isolated container.
    const production = spawnSync('docker', [...probeArgs.slice(0, -1), '/probe/probe-worker.mjs'], {
      encoding: 'utf8', input: JSON.stringify({ url: receipt.url, address, files: receipt.files }), timeout: 15000 })
    assert.notEqual(production.status, 0); assert.match(production.stderr, /public probe target rejected/)
    browser = await chromium.launch({ headless: true, args: [`--host-resolver-rules=MAP *.sites.codeless-public.test 127.0.0.1`, '--no-proxy-server'] })
    const context = await browser.newContext({ ignoreHTTPSErrors: true, // Explicit self-signed local fixture only.
      proxy: { server: 'http://127.0.0.1:9', bypass: '*.sites.codeless-public.test,127.0.0.1' },
      serviceWorkers: 'block', acceptDownloads: false })
    const page = await context.newPage()
    await page.goto(`https://${hostname}:${port}/tasks`)
    assert.match(await page.locator('#app').innerText(), /任务/)
    await page.reload(); assert.match(await page.locator('#app').innerText(), /任务/)
    await page.screenshot({ path: join(evidence, 'public-tasks-refresh.png'), fullPage: true })
    await context.close()
    const second = await publish({ deploymentId: randomUUID(), version, verification: observed.verification, handle })
    const missing = second.files.find(file => file.path.endsWith('.js'))
    await unlink(join(hostingRoot, second.deploymentId, missing.path))
    const failure = spawnSync('docker', probeArgs, { encoding: 'utf8', input: JSON.stringify({ url: second.url, address, files: second.files }), timeout: 15000 })
    assert.equal(failure.status, 1)
    const failedProbe = JSON.parse(failure.stdout); assert.equal(failedProbe.status, 'FAILED')
    assert.equal(digest((await get('/')).body), index.digest, 'failed second deployment must not mutate first')
    const result = { localTlsFixture: true, publicMilestoneReached: false, realBuild: observed.build.status,
      buildExitCode: observed.build.exitCode, realBrowserVerification: observed.verification.status, version, receipt,
      httpEvidence, isolatedProbe: probe, failedProbe, productionPrivateTargetExitCode: production.status,
      immutablePreviousDigest: index.digest, sourceDigest: observed.sourceDigest }
    await writeFile(join(evidence, 'acceptance.json'), JSON.stringify(result, null, 2))
  } finally {
    if (browser) await browser.close()
    await handle.close()
    if (hostingCreated) docker(['rm', '-f', container])
    if (networkCreated) docker(['network', 'rm', network])
  }
})
