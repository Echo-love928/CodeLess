// D23-A-T4: actual source generation -> backup -> destroyed source -> restored app.
// Named Mock proposes files; production PG/build/browser/export code determines results.
import assert from 'node:assert/strict'
import { once } from 'node:events'
import { createServer } from 'node:net'
import { request } from 'node:http'
import { randomUUID, randomBytes } from 'node:crypto'
import { mkdir, readFile, writeFile, chmod } from 'node:fs/promises'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { chromium, expect } from '@playwright/test'
import { root, prepareEnvironment, prepareRuntime, run, start, stop, windows } from './application_support.mjs'
import { tlsServer, closeServer } from '../e2e/preview/fixtures.mjs'
import { hostingConfig } from '../../infra/hosting/render.mjs'
import { verify, sha } from '../export/verify-export.mjs'
import { awaitDeployment } from '../e2e/full/deployment-terminal.mjs'
import { openInitialLogin } from '../e2e/full/initial-navigation.mjs'

const PG = 'postgres:17.6-alpine@sha256:ef257d85f76e48da1c64832459b59fcaba1a4dac97bf5d7450c77753542eee94'
const NGINX = 'nginx:1.27.5-alpine@sha256:65645c7bb6a0661892a8b03b89d0743208a18dd2f3f17a54ef4b76fb8e2f2a10'
const output = join(root, 'tests/backup/.private/application', new Date().toISOString().replaceAll(':', '-') + '-' + randomUUID())
await mkdir(output, { recursive: true })
const stateFile = join(output, 'state.json')
const report = { task: 'D23-A', test: 'recovered-application-T4', status: 'RUNNING', startedAt: new Date().toISOString(),
  runtimeRevision: run('git', ['-c', 'safe.directory=' + root.replaceAll('\\', '/').replace(/\/$/, ''), 'rev-parse', 'HEAD']),
  modelProvider: 'deterministic-mock', paidModelRequests: 0, publicAcceptance: false,
  environment: 'two independent PG clusters and fresh owned JVM/preview processes on one Windows/Linux host',
  supervisor: 'closed owned-process ports; production Linux/systemd supervisor NOT exercised',
  commands: [], cleanupErrors: [] }
let env, api, preview, hosting, tls, browser, imageBefore, savedImageTag, sourceContainer, targetContainer
let apiPort, controlPort, previewPort, publicPort, platformOrigin, dist
const containers = new Map()
const state = { runtimeRevision: report.runtimeRevision, roots: Object.fromEntries(
  ['agent', 'workspaces', 'modelAudit', 'fileAudit', 'adminAudit', 'hosting', 'release'].map(name => [name, join(output, 'runtime', name)])),
  sourceStopped: false, quiescedPorts: [] }
const save = async () => {
  await writeFile(stateFile, JSON.stringify(state, null, 2))
  await writeFile(join(output, 'application.json'), JSON.stringify(report, null, 2) + '\n')
}
const docker = args => run('docker', args, { timeout: 120000 })
const port = async () => { const s = createServer(); s.listen(0, '127.0.0.1'); await once(s, 'listening'); const p = s.address().port; await new Promise(done => s.close(done)); return p }
const sleep = ms => new Promise(done => setTimeout(done, ms))
const sql = (container, text) => docker(['exec', container, 'psql', '-U', 'd23_fixture', '-d', 'd23_fixture', '-At', '-v', 'ON_ERROR_STOP=1', '-c', text])
async function storage(action) {
  await save()
  const command = [process.env.CODELESS_BACKUP_PYTHON ?? (windows ? 'python' : 'python3'), '-B', 'tests/backup/application_storage.py', action, stateFile]
  const started = new Date().toISOString()
  const result = spawnSync(command[0], command.slice(1), { cwd: root, env, encoding: 'utf8', windowsHide: true, timeout: 240000 })
  await writeFile(join(output, 'storage-' + action + '.log'), (result.stdout ?? '') + (result.stderr ?? ''))
  report.commands.push({ action, command: ['python', '-B', 'tests/backup/application_storage.py', action, '<private-state>'],
    startedAt: started, finishedAt: new Date().toISOString(), exitCode: result.status, signal: result.signal })
  assert.equal(result.status, 0, 'Storage ' + action + ': ' + result.stderr)
  const value = JSON.parse(result.stdout.trim()); await save(); return value
}
async function createDatabase(role) {
  const name = 'codeless-d23-' + role + '-' + randomUUID()
  const id = docker(['run', '-d', '--name', name, '--label', 'codeless.d23-application=true',
    '--memory', '384m', '--cpus', '0.5', '--pids-limit', '128', '-p', '127.0.0.1::5432',
    '-e', 'POSTGRES_USER=d23_fixture', '-e', 'POSTGRES_DB=d23_fixture', '-e', 'POSTGRES_PASSWORD=fixture-only-d23', PG])
  containers.set(role, id)
  const deadline = Date.now() + 30000
  while (spawnSync('docker', ['exec', id, 'pg_isready', '-U', 'd23_fixture', '-d', 'd23_fixture'], { windowsHide: true, timeout: 3000 }).status !== 0) {
    assert.ok(Date.now() < deadline, 'PG readiness'); await sleep(100)
  }
  const info = JSON.parse(docker(['inspect', id]))[0]
  return { container: id, port: info.NetworkSettings.Ports['5432/tcp'][0].HostPort,
    database: { container: name, database: 'd23_fixture', user: 'd23_fixture' } }
}
async function removeContainer(role) {
  const id = containers.get(role); if (!id) return
  const info = JSON.parse(docker(['inspect', id]))[0]
  assert.equal(info.Id, id); assert.equal(info.Config.Labels['codeless.d23-application'], 'true')
  docker(['rm', '-f', '-v', id]); containers.delete(role)
}
async function startHosting(role) {
  const id = docker(['run', '-d', '--name', 'codeless-d23-host-' + randomUUID(), '--label', 'codeless.d23-application=true',
    '--read-only', '--user', '101:101', '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges',
    '--pids-limit', '64', '--memory', '128m', '--cpus', '0.5',
    '--tmpfs', '/var/cache/nginx:uid=101,gid=101,mode=0700', '--tmpfs', '/var/run:uid=101,gid=101,mode=0700',
    '-p', `127.0.0.1:${publicPort}:8443`,
    '--mount', `type=bind,source=${state.roots.hosting},target=/sites,readonly`,
    '--mount', `type=bind,source=${join(output, 'nginx.conf')},target=/etc/nginx/conf.d/default.conf,readonly`,
    '--mount', `type=bind,source=${join(output, 'tls/test-cert.pem')},target=/certs/server.pem,readonly`,
    '--mount', `type=bind,source=${join(output, 'tls/test-key.pem')},target=/certs/server.key,readonly`, NGINX])
  containers.set(role, id); docker(['exec', id, 'nginx', '-t']); return id
}
async function readyAPI() {
  const deadline = Date.now() + 60000
  while (true) {
    assert.equal(api.exitCode, null, 'API exited; inspect private API log')
    if (api.launchError) throw api.launchError
    try { if ((await fetch(`http://127.0.0.1:${apiPort}/api/v0/auth/csrf`, { signal: AbortSignal.timeout(1000) })).status === 200) return } catch { /* startup only */ }
    assert.ok(Date.now() < deadline, 'API readiness timeout'); await sleep(100)
  }
}
async function startApplication(database, restored) {
  const repo = join(state.roots.release, 'repository')
  env.CODELESS_DATABASE_URL = `jdbc:postgresql://127.0.0.1:${database.port}/d23_fixture`
  // New signing/registry keys after recovery; no previous sessions/tickets reused.
  env.CODELESS_PREVIEW_SIGNING_KEY = randomBytes(32).toString('hex')
  env.CODELESS_PREVIEW_REGISTRY_KEY = randomBytes(32).toString('hex')
  const args = ['-Xms128m', '-Xmx384m', '-Dloader.main=' + (restored ? 'dev.codeless.api.CodeLessApiApplication' : 'd20.fixture.FixtureApplication')]
  if (!restored) args.push('-Dloader.path=' + join(state.roots.release, 'fixture-classes'))
  args.push('-cp', join(state.roots.release, 'api.jar'), 'org.springframework.boot.loader.launch.PropertiesLauncher',
    '--server.address=127.0.0.1', '--server.port=' + apiPort, '--codeless.agent.enabled=' + !restored,
    '--codeless.tasks.enabled=' + !restored, '--codeless.deploy.worker-enabled=' + !restored,
    '--codeless.recovery.sweep-enabled=false', '--codeless.agent.repair.enabled=false',
    '--codeless.agent.repository-root=' + repo, '--codeless.export.repository-root=' + repo,
    '--codeless.agent.private-root=' + state.roots.agent, '--codeless.admin.audit-root=' + state.roots.adminAudit,
    '--codeless.agent.node=' + process.execPath, '--codeless.tasks.poll-ms=100', '--codeless.deploy.poll-ms=100',
    '--CODELESS_PREVIEW_GATEWAY_INTERNAL_ORIGIN=http://127.0.0.1:' + controlPort)
  api = start(join(env.JAVA_HOME, 'bin', windows ? 'java.exe' : 'java'), args, env,
    join(output, restored ? 'restored-api.log' : 'source-api.log'))
  await readyAPI()
  preview = start(process.execPath, [join(repo, 'services/runner/src/preview/main.mjs')], env,
    join(output, restored ? 'restored-preview.log' : 'source-preview.log'))
  report[restored ? 'restoredProcesses' : 'sourceProcesses'] = { apiPid: api.pid, previewPid: preview.pid,
    apiMain: restored ? 'production' : 'explicit deterministic fixture', runtimeJarSha256: sha(await readFile(join(state.roots.release, 'api.jar'))) }
}
async function openBrowser() {
  browser = await chromium.launch({ args: ['--host-resolver-rules=MAP *.test 127.0.0.1', '--no-proxy-server'] })
  const context = await browser.newContext({ baseURL: platformOrigin, ignoreHTTPSErrors: true,
    viewport: { width: 1280, height: 900 }, serviceWorkers: 'block',
    proxy: { server: 'http://127.0.0.1:9', bypass: '*.test,127.0.0.1' } })
  await context.route('**/*', route => {
    const u = new URL(route.request().url())
    return u.protocol === 'https:' && (u.hostname === 'platform.codeless.test' ||
      /^v[a-f0-9]{32}\.preview\.codeless-preview\.test$/.test(u.hostname) ||
      /^d[a-f0-9]{32}\.sites\.codeless-public\.test$/.test(u.hostname)) ? route.continue() : route.abort()
  })
  const page = await context.newPage()
  await openInitialLogin(page)
  await page.getByLabel('邮箱').fill('demo@codeless.local')
  await page.getByLabel('密码').fill('demo-password-for-test-only')
  await page.getByRole('button', { name: '登录', exact: true }).click()
  await expect(page).toHaveURL(/\/apps$/)
  return { context, page }
}
async function call(page, path, method = 'GET', body, key) {
  return page.evaluate(async ({ path, method, body, key }) => {
    const headers = { 'Content-Type': 'application/json' }
    if (method !== 'GET') headers['X-CSRF-Token'] = (await (await fetch('/api/v0/auth/csrf')).json()).token
    if (key) headers['Idempotency-Key'] = key
    const r = await fetch('/api/v0/' + path, { method, headers, ...(body ? { body: JSON.stringify(body) } : {}) })
    return { status: r.status, body: await r.json() }
  }, { path, method, body, key })
}
async function get(page, path) { const r = await call(page, path); assert.equal(r.status, 200, path); return r.body }
async function download(page, path) {
  // Use the authenticated browser's actual network path and DNS confinement.
  // APIRequestContext has a separate proxy/DNS implementation from Chromium.
  const bytes = await page.evaluate(async path => {
    const response = await fetch(path)
    if (response.status !== 200) throw new Error('Source download HTTP ' + response.status)
    return Array.from(new Uint8Array(await response.arrayBuffer()))
  }, path)
  return Buffer.from(bytes)
}
try {
  env = prepareEnvironment()
  // A successful empty listing means absent. Daemon/permission errors stay errors.
  const previousImage = docker(['image', 'ls', '--no-trunc', '--filter', 'reference=codeless-vue-build:d05', '--format', '{{.ID}}'])
  if (previousImage) {
    imageBefore = docker(['image', 'inspect', 'codeless-vue-build:d05', '--format', '{{.Id}}'])
    savedImageTag = 'codeless-d23-image-preserve:' + randomUUID()
    docker(['tag', 'codeless-vue-build:d05', savedImageTag])
  }
  report.originalImageAliasPresent = Boolean(imageBefore)
  prepareRuntime(env)
  apiPort = await port(); controlPort = await port(); previewPort = await port(); publicPort = await port()
  state.quiescedPorts = [apiPort, controlPort, previewPort]
  await save()
  report.preparedRelease = await storage('prepare-release')
  const image = spawnSync('docker', ['image', 'inspect', 'codeless-vue-build:d05', '--format', '{{.Id}}'], { encoding: 'utf8', windowsHide: true })
  assert.equal(image.status, 0)
  run('docker', ['build', '--file', join(state.roots.release, 'repository/infra/build-image/Dockerfile'),
    '--tag', 'codeless-vue-build:d05', join(state.roots.release, 'repository')], { env, timeout: 240000, stdio: 'inherit' })
  state.imageId = docker(['image', 'inspect', 'codeless-vue-build:d05', '--format', '{{.Id}}'])
  report.sourceImageId = state.imageId
  for (const [name, path] of Object.entries(state.roots)) if (name !== 'release') await mkdir(path, { recursive: true })
  tls = await tlsServer(join(output, 'tls'), async (req, res) => {
    const host = req.headers.host?.split(':')[0]
    const toAPI = host === 'platform.codeless.test' && req.url.startsWith('/api/')
    const toPreview = /^v[a-f0-9]{32}\.preview\.codeless-preview\.test$/.test(host ?? '')
    if (toAPI || toPreview) {
      const proxy = request({ host: '127.0.0.1', port: toAPI ? apiPort : previewPort,
        path: req.url, method: req.method, headers: req.headers }, upstream => { res.writeHead(upstream.statusCode, upstream.headers); upstream.pipe(res) })
      proxy.setTimeout(15000, () => proxy.destroy(new Error('fixed fixture proxy timeout')))
      proxy.on('error', () => { if (!res.headersSent) res.writeHead(502); res.end() }); req.pipe(proxy); return
    }
    if (host !== 'platform.codeless.test') { res.writeHead(404); res.end(); return }
    if (req.url === '/codeless-publication-config.json') {
      res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ publicOrigin: env.CODELESS_PUBLICATION_ORIGIN })); return
    }
    try {
      const pathname = new URL(req.url, platformOrigin).pathname
      const asset = /^\/assets\/[A-Za-z0-9_.-]+$/.test(pathname)
      const file = asset ? pathname.slice(1) : 'index.html'
      res.writeHead(200, { 'Content-Type': file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : 'text/html' })
      res.end(await readFile(join(dist, file)))
    } catch { if (!res.headersSent) res.writeHead(404); res.end() }
  })
  platformOrigin = 'https://platform.codeless.test:' + tls.address().port
  const previewOrigin = 'https://preview.codeless-preview.test:' + tls.address().port
  const publicOrigin = 'https://sites.codeless-public.test:' + publicPort
  Object.assign(env, { CODELESS_DATABASE_USER: 'd23_fixture', CODELESS_DATABASE_PASSWORD: 'fixture-only-d23',
    CODELESS_MODEL_PROVIDER: 'deterministic-mock', CODELESS_DEMO_PASSWORD: 'demo-password-for-test-only',
    CODELESS_ADMIN_PASSWORD: 'admin-password-for-test-only', CODELESS_PLATFORM_ORIGIN: platformOrigin,
    CODELESS_PREVIEW_ORIGIN: previewOrigin, CODELESS_PUBLICATION_ORIGIN: publicOrigin,
    CODELESS_AGENT_PRIVATE_ROOT: state.roots.agent, CODELESS_FILE_WORKSPACE_ROOT: state.roots.workspaces,
    CODELESS_FILE_AUDIT_ROOT: state.roots.fileAudit, CODELESS_MODEL_AUDIT_ROOT: state.roots.modelAudit,
    CODELESS_HOSTING_ROOT: state.roots.hosting, CODELESS_PREVIEW_API_INTERNAL_ORIGIN: 'http://127.0.0.1:' + apiPort,
    CODELESS_PREVIEW_CONTROL_PORT: String(controlPort), CODELESS_PREVIEW_GATEWAY_PORT: String(previewPort) })
  dist = join(state.roots.release, 'web')
  run(process.execPath, ['apps/web/node_modules/vite/bin/vite.js', 'build', 'apps/web', '--config', 'apps/web/vite.config.ts', '--outDir', dist],
    { env: { ...env, VITE_CODELESS_PREVIEW_ORIGIN: previewOrigin }, stdio: 'inherit' })
  await storage('seal-release')
  await writeFile(join(output, 'nginx.conf'), await hostingConfig({ publicOrigin, platformOrigin, previewOrigin }))
  await chmod(join(output, 'tls/test-key.pem'), 0o644) // disposable local fixture only
  const source = await createDatabase('source'); sourceContainer = source.container; state.sourceDatabase = source.database
  report.sourceClusterIdentity = sql(sourceContainer, "SELECT system_identifier FROM pg_control_system()")
  report.cleanSourceDatabase = Number(sql(sourceContainer, "SELECT count(*) FROM pg_class WHERE relnamespace='public'::regnamespace"))
  assert.equal(report.cleanSourceDatabase, 0)
  hosting = await startHosting('source-host')
  await startApplication(source, false)
  const before = await openBrowser()
  await before.page.getByRole('button', { name: '新建应用', exact: true }).first().click()
  await before.page.getByLabel('应用名称').fill('D23 recovered immutable version')
  await before.page.getByLabel('数据模式').selectOption('STATIC')
  await before.page.getByRole('button', { name: '创建', exact: true }).click()
  await expect(before.page).toHaveURL(/\/workbench\/[0-9a-f-]+$/)
  const applicationId = new URL(before.page.url()).pathname.split('/').at(-1)
  await before.page.getByLabel('需求描述').fill('生成静态 Ada Lovelace 个人展示页及作品列表')
  const accepted = before.page.waitForResponse(r => new URL(r.url()).pathname === '/api/v0/tasks' && r.request().method() === 'POST')
  await before.page.getByRole('button', { name: '开始生成', exact: true }).click()
  const response = await accepted; assert.equal(response.status(), 202)
  const taskId = (await response.json()).id
  await expect.poll(async () => (await get(before.page, 'tasks/' + taskId)).status, { timeout: 120000 }).toBe('READY')
  const application = await get(before.page, 'applications/' + applicationId)
  const versionId = application.latestReadyVersionId
  const selected = await get(before.page, 'versions/' + versionId)
  await expect(before.page.frameLocator('iframe[title="当前版本预览"]').getByTestId('profile-name')).toHaveText('Ada Lovelace', { timeout: 30000 })
  await before.page.getByRole('button', { name: '发布', exact: true }).click()
  const panel = before.page.getByRole('region', { name: '发布面板' })
  await panel.getByRole('button', { name: '重新读取版本与发布记录', exact: true }).click()
  await expect(panel).toContainText(versionId)
  await before.page.getByLabel('我确认公开发布上方版本').check()
  const published = before.page.waitForResponse(r => new URL(r.url()).pathname === '/api/v0/publications' && r.request().method() === 'POST')
  await before.page.getByRole('button', { name: '确认发布', exact: true }).click()
  const publicationResponse = await published; assert.equal(publicationResponse.status(), 202)
  const publication = await publicationResponse.json()
  const observations = []
  const deployed = await awaitDeployment(() => get(before.page, 'publications/' + publication.id + '/deployment'), publication.id, observations)
  assert.equal(deployed.phase, 'SUCCEEDED')
  const sourceZip = await download(before.page, '/api/v0/versions/' + versionId + '/export')
  const binding = { applicationId, taskId, versionId, buildId: selected.buildId,
    sourceDigest: selected.sourceDigest, artifactDigest: deployed.artifactDigest, publicationId: publication.id }
  assert.equal(verify(sourceZip, binding).status, 'PASSED')
  state.binding = binding; report.binding = binding; report.sourceExportSha256 = sha(sourceZip)
  await writeFile(join(output, 'source.zip'), sourceZip)
  report.sourceMockModelUsage = JSON.parse(sql(sourceContainer, "SELECT json_build_object('providers',(SELECT json_agg(DISTINCT provider) FROM model_calls),'calls',(SELECT count(*) FROM model_calls),'inputTokens',(SELECT CASE WHEN bool_and(input_tokens IS NOT NULL) THEN sum(input_tokens) END FROM model_calls),'outputTokens',(SELECT CASE WHEN bool_and(output_tokens IS NOT NULL) THEN sum(output_tokens) END FROM model_calls))"))
  await before.page.locator('iframe[title="当前版本预览"]').screenshot({ path: join(output, 'source-preview.png') })
  await browser.close(); browser = null
  await stop(preview); await stop(api)
  report.sourceProcessExit = { apiCode: api.exitCode, apiSignal: api.signalCode,
    previewCode: preview.exitCode, previewSignal: preview.signalCode }
  assert.ok(api.exitCode !== null || api.signalCode !== null)
  assert.ok(preview.exitCode !== null || preview.signalCode !== null)
  preview = null; api = null
  await removeContainer('source-host'); hosting = null
  state.sourceStopped = true; report.sourceWritersStoppedBeforeBackup = true
  report.backup = await storage('backup')
  report.quarantine = await storage('quarantine')
  await removeContainer('source'); sourceContainer = null
  report.sourceClusterDestroyedBeforeRestore = true
  const target = await createDatabase('target'); targetContainer = target.container; state.targetDatabase = target.database
  report.targetClusterIdentity = sql(targetContainer, "SELECT system_identifier FROM pg_control_system()")
  assert.notEqual(report.targetClusterIdentity, report.sourceClusterIdentity)
  report.emptyTargetDatabase = Number(sql(targetContainer, "SELECT count(*) FROM pg_class WHERE relnamespace='public'::regnamespace"))
  assert.equal(report.emptyTargetDatabase, 0)
  report.offlineRestore = await storage('restore')
  report.activation = await storage('activate')
  report.negativeControl = await storage('negative')
  hosting = await startHosting('restored-host')
  await startApplication(target, true)
  const after = await openBrowser()
  report.originalOwnerLoginAfterRestore = true
  await after.page.goto('/workbench/' + applicationId)
  const restoredApp = await get(after.page, 'applications/' + applicationId)
  assert.equal(restoredApp.latestReadyVersionId, versionId)
  assert.deepEqual(await get(after.page, 'versions/' + versionId), selected)
  const snapshot = await get(after.page, 'versions/' + versionId + '/snapshot')
  assert.equal(snapshot.versionId, versionId); assert.equal(snapshot.status, 'VERIFIED'); assert.equal(snapshot.sourceDigest, binding.sourceDigest)
  await expect(after.page.frameLocator('iframe[title="当前版本预览"]').getByTestId('profile-name')).toHaveText('Ada Lovelace', { timeout: 30000 })
  await after.page.locator('iframe[title="当前版本预览"]').screenshot({ path: join(output, 'restored-preview.png') })
  await after.page.reload()
  await expect(after.page.frameLocator('iframe[title="当前版本预览"]').getByTestId('profile-name')).toHaveText('Ada Lovelace', { timeout: 30000 })
  report.existingPreviewAndRefreshAfterRestore = true
  const ledger = await get(after.page, 'publications/' + publication.id + '/deployment')
  assert.equal(ledger.phase, 'SUCCEEDED'); assert.equal(ledger.publication.versionId, versionId)
  const publicPage = await after.context.newPage()
  assert.equal((await publicPage.goto(ledger.publication.url)).status(), 200)
  await expect(publicPage.getByTestId('profile-name')).toHaveText('Ada Lovelace')
  await publicPage.close(); report.existingPublicationServesRestoredBytes = true
  const restoredZip = await download(after.page, '/api/v0/versions/' + versionId + '/export')
  const checked = verify(restoredZip, { ...binding, forbiddenStrings: ['fixture-only-d23', 'demo-password-for-test-only'] })
  assert.equal(checked.status, 'PASSED', JSON.stringify(checked.failures))
  assert.deepEqual(restoredZip, sourceZip)
  await writeFile(join(output, 'restored.zip'), restoredZip)
  report.restoredExportSha256 = sha(restoredZip); report.sourceAndRestoredArchivesIdentical = true
  await browser.close(); browser = null
  report.postBrowserConsistency = await storage('compare')
  const clean = spawnSync(process.execPath, ['tests/export/clean-build.mjs', join(output, 'restored.zip'), join(output, 'clean-build'),
    '--expect-artifact-digest', binding.artifactDigest], { cwd: root, env, encoding: 'utf8', windowsHide: true, timeout: 300000 })
  await writeFile(join(output, 'clean-command.log'), (clean.stdout ?? '') + (clean.stderr ?? ''))
  report.cleanBuildExitCode = clean.status; report.cleanBuildSignal = clean.signal
  assert.equal(clean.status, 0, 'Restored ZIP independent build must reproduce exact artifact')
  report.cleanBuild = JSON.parse(await readFile(join(output, 'clean-build/clean-build.json')))
  assert.equal(report.cleanBuild.status, 'PASSED'); assert.equal(report.cleanBuild.reproduction, 'REPRODUCED')
  assert.equal(report.cleanBuild.hostProjectUnchanged, true); assert.equal(report.cleanBuild.hostNodeModulesCreated, false)
  report.applicationAcceptance = 'PASSED'; report['D23-A-T1'] = 'PASSED'; report['D23-A-T4'] = 'PASSED'; report.status = 'PASSED'
} catch (error) {
  report.status = 'FAILED'; report.error = error.stack; report.applicationAcceptance = 'NOT_PASSED'
  console.error('D23 application recovery failed; inspect private run logs')
} finally {
  for (const [name, cleanup] of [['browser', () => browser?.close()], ['preview', () => stop(preview)], ['api', () => stop(api)], ['tls', () => tls && closeServer(tls)]]) {
    try { await cleanup() } catch (error) { report.cleanupErrors.push({ resource: name, error: error.message }) }
  }
  for (const role of [...containers.keys()]) {
    try { await removeContainer(role) } catch (error) { report.cleanupErrors.push({ resource: role, error: error.message }) }
  }
  if (imageBefore) {
    try {
      docker(['tag', savedImageTag, 'codeless-vue-build:d05'])
      assert.equal(docker(['image', 'inspect', 'codeless-vue-build:d05', '--format', '{{.Id}}']), imageBefore)
      docker(['image', 'rm', savedImageTag]); report.originalImageAliasRestored = true
    }
    catch (error) { report.cleanupErrors.push({ resource: 'original-image-alias', error: error.message }) }
  } else {
    report.originalImageAliasRestored = null
    report.imageAliasNoPreviousState = true
  }
  if (report.cleanupErrors.length) report.status = 'FAILED'
  report.finishedAt = new Date().toISOString()
  await save()
  console.log(JSON.stringify({ task: report.task, status: report.status, output,
    applicationAcceptance: report.applicationAcceptance ?? 'NOT_RUN', cleanupErrors: report.cleanupErrors.length }))
  process.exitCode = report.status === 'PASSED' ? 0 : 1
}
