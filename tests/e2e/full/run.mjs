import assert from 'node:assert/strict'
import { once } from 'node:events'
import { createServer } from 'node:net'
import { request } from 'node:http'
import { randomUUID, createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { mkdir, readFile, writeFile, chmod } from 'node:fs/promises'
import { join } from 'node:path'
import { root, run, start, stop, windows } from './support.mjs'
import { prepare } from './prepare.mjs'
import { tlsServer, closeServer } from '../preview/fixtures.mjs'
import { startPreviewRuntime } from '../../../services/runner/src/preview/main.mjs'
import { hostingConfig } from '../../../infra/hosting/render.mjs'

const output = join(root, '.local-data/d20-b/runs', new Date().toISOString().replaceAll(':', '-') + '-' + randomUUID())
await mkdir(output, { recursive: true })
const report = { task: 'D20-B', status: 'RUNNING', startedAt: new Date().toISOString(), output, retries: 0,
  revision: run('git', ['rev-parse', 'HEAD']), revisionRole: 'checkout-reference',
  changes: run('git', ['status', '--porcelain']), modelProvider: 'deterministic-mock', paidModelRequests: 0,
  publicAcceptance: false, hostingProbe: 'explicit local HTTPS fixture; production public probe unchanged' }
const sha = bytes => 'sha256:' + createHash('sha256').update(bytes).digest('hex')
const paths = run('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z']).split('\0')
  .filter(p => p && !p.includes('/evidence/') && /^(apps\/web\/|services\/|tests\/e2e\/full\/|templates\/|infra\/)/.test(p))
report.sources = Object.fromEntries(await Promise.all(paths.map(async p => [p, sha(await readFile(join(root, p)))])))
await writeFile(join(output, 'run.json'), JSON.stringify(report, null, 2))
console.log(JSON.stringify({ output, task: 'D20-B', status: 'RUNNING' }))
let database, hosting, tls, runtime, api, browser
const docker = args => run('docker', args, { timeout: 60000 })
const port = async () => { const server = createServer(); server.listen(0, '127.0.0.1'); await once(server, 'listening'); const value = server.address().port; await new Promise(done => server.close(done)); return value }
const sleep = ms => new Promise(done => setTimeout(done, ms))
const sql = text => docker(['exec', database, 'psql', '-U', 'd20_test', '-d', 'd20_test', '-At', '-v', 'ON_ERROR_STOP=1', '-c', text])
try {
  const { env, classpath } = prepare()
  const apiPort = await port(), controlPort = await port(), hostingPort = await port()
  let dist, platformOrigin
  tls = await tlsServer(join(output, 'tls'), async (req, res) => {
    try {
      if (req.headers.host !== new URL(platformOrigin).host) {
        if (runtime && /^v[a-f0-9]{32}\.preview\.codeless-preview\.test$/.test(req.headers.host?.split(':')[0] ?? '')) return runtime.gateway.server.emit('request', req, res)
        res.writeHead(404); return res.end()
      }
      if (req.url.startsWith('/api/')) {
        const upstream = request({ host: '127.0.0.1', port: apiPort, path: req.url, method: req.method, headers: req.headers }, response => {
          res.writeHead(response.statusCode, response.headers); response.pipe(res)
        })
        upstream.setTimeout(15000, () => upstream.destroy(new Error('API fixture proxy timeout')))
        upstream.on('error', () => { if (!res.headersSent) res.writeHead(502); res.end() }); req.pipe(upstream); return
      }
      if (req.url === '/codeless-publication-config.json') {
        res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
        return res.end(JSON.stringify({ publicOrigin: env.CODELESS_PUBLICATION_ORIGIN }))
      }
      const pathname = new URL(req.url, 'https://fixture.test').pathname
      if (!/^\/(?:assets\/[A-Za-z0-9_.-]+|[A-Za-z0-9_.-]+)$/.test(pathname) || !pathname.includes('.')) {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); return res.end(await readFile(join(dist, 'index.html')))
      }
      const bytes = await readFile(join(dist, pathname.slice(1)))
      res.writeHead(200, { 'Content-Type': pathname.endsWith('.js') ? 'text/javascript' : pathname.endsWith('.css') ? 'text/css' : 'application/octet-stream' }); res.end(bytes)
    } catch { if (!res.headersSent) res.writeHead(404); res.end() }
  })
  platformOrigin = 'https://platform.codeless.test:' + tls.address().port
  const previewOrigin = 'https://preview.codeless-preview.test:' + tls.address().port
  const publicOrigin = 'https://sites.codeless-public.test:' + hostingPort
  Object.assign(env, { CODELESS_DATABASE_USER: 'd20_test', CODELESS_DATABASE_PASSWORD: 'fixture-only-d20', CODELESS_MODEL_PROVIDER: 'deterministic-mock',
    CODELESS_DEMO_PASSWORD: 'demo-password-for-test-only', CODELESS_ADMIN_PASSWORD: 'admin-password-for-test-only',
    CODELESS_PLATFORM_ORIGIN: platformOrigin, CODELESS_PREVIEW_ORIGIN: previewOrigin, CODELESS_PUBLICATION_ORIGIN: publicOrigin,
    CODELESS_PREVIEW_SIGNING_KEY: '11'.repeat(32), CODELESS_PREVIEW_REGISTRY_KEY: '44'.repeat(32),
    CODELESS_AGENT_PRIVATE_ROOT: join(output, 'private'), CODELESS_FILE_WORKSPACE_ROOT: join(output, 'workspaces'),
    CODELESS_FILE_AUDIT_ROOT: join(output, 'file-audit'), CODELESS_MODEL_AUDIT_ROOT: join(output, 'model-audit'),
    CODELESS_ADMIN_AUDIT_ROOT: join(output, 'admin-audit'), CODELESS_HOSTING_ROOT: join(output, 'sites'),
    CODELESS_PREVIEW_API_INTERNAL_ORIGIN: 'http://127.0.0.1:' + apiPort,
    CODELESS_PREVIEW_CONTROL_PORT: String(controlPort), CODELESS_PREVIEW_GATEWAY_PORT: '0',
    CODELESS_FULL_ORIGIN: platformOrigin, CODELESS_FULL_OUTPUT: output })
  // Only explicit test-injection flags can cross the sanitized boundary.
  if (process.env.CODELESS_FULL_INJECT_ASSERTION === '1') env.CODELESS_FULL_INJECT_ASSERTION = '1'
  await mkdir(env.CODELESS_HOSTING_ROOT)
  await mkdir(env.CODELESS_AGENT_PRIVATE_ROOT)
  await mkdir(env.CODELESS_FILE_WORKSPACE_ROOT)
  dist = join(output, 'web-dist')
  run(process.execPath, ['apps/web/node_modules/vite/bin/vite.js', 'build', 'apps/web', '--config', 'apps/web/vite.config.ts', '--outDir', dist],
    { env: { ...env, VITE_CODELESS_PREVIEW_ORIGIN: previewOrigin }, stdio: 'inherit' })
  database = docker(['run', '-d', '--name', 'codeless-d20-db-' + randomUUID(), '--label', 'codeless.test=d20-full',
    '-p', '127.0.0.1::5432', '-e', 'POSTGRES_USER=d20_test', '-e', 'POSTGRES_PASSWORD=fixture-only-d20', '-e', 'POSTGRES_DB=d20_test',
    'postgres:17.6-alpine@sha256:ef257d85f76e48da1c64832459b59fcaba1a4dac97bf5d7450c77753542eee94'])
  const dbPort = JSON.parse(docker(['inspect', database]))[0].NetworkSettings.Ports['5432/tcp'][0].HostPort
  env.CODELESS_DATABASE_URL = `jdbc:postgresql://127.0.0.1:${dbPort}/d20_test`
  report.databaseId = database
  const databaseDeadline = Date.now() + 15000
  while (spawnSync('docker', ['exec', database, 'pg_isready', '-U', 'd20_test', '-d', 'd20_test'], { windowsHide: true, timeout: 3000 }).status !== 0) {
    assert.ok(Date.now() < databaseDeadline, 'Dedicated PostgreSQL readiness deadline')
    await sleep(100)
  }
  api = start(join(env.JAVA_HOME, 'bin', windows ? 'java.exe' : 'java'), ['-cp', classpath, 'd20.fixture.FixtureApplication',
    '--server.address=127.0.0.1', '--server.port=' + apiPort, '--codeless.agent.enabled=true', '--codeless.agent.repair.enabled=false',
    '--codeless.agent.repository-root=' + root, '--codeless.agent.private-root=' + env.CODELESS_AGENT_PRIVATE_ROOT,
    '--codeless.agent.node=' + process.execPath, '--codeless.tasks.poll-ms=100', '--codeless.deploy.poll-ms=100',
    '--CODELESS_PREVIEW_GATEWAY_INTERNAL_ORIGIN=http://127.0.0.1:' + controlPort], env, join(output, 'api.log'))
  const readyEnd = Date.now() + 60000
  while (true) {
    assert.equal(api.exitCode, null, 'API exited; inspect api.log')
    if (api.launchError) throw api.launchError
    try { if ((await fetch(env.CODELESS_PREVIEW_API_INTERNAL_ORIGIN + '/api/v0/auth/csrf', { signal: AbortSignal.timeout(1000) })).status === 200) break } catch { /* bounded startup readiness */ }
    assert.ok(Date.now() < readyEnd, 'API readiness deadline; inspect api.log'); await sleep(200)
  }
  report.cleanDatabase = JSON.parse(sql("SELECT json_build_object('applications',(SELECT count(*) FROM applications),'tasks',(SELECT count(*) FROM generation_tasks),'builds',(SELECT count(*) FROM builds),'publications',(SELECT count(*) FROM publications))"))
  assert.deepEqual(report.cleanDatabase, { applications: 0, tasks: 0, builds: 0, publications: 0 })
  runtime = await startPreviewRuntime(env)
  await writeFile(join(output, 'nginx.conf'), await hostingConfig({ publicOrigin, platformOrigin, previewOrigin }))
  await chmod(join(output, 'tls/test-key.pem'), 0o644) // disposable fixture key only
  hosting = docker(['run', '-d', '--name', 'codeless-d20-host-' + randomUUID(), '--label', 'codeless.test=d20-full', '--read-only', '--user', '101:101',
    '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges', '--pids-limit', '64', '--memory', '128m', '--cpus', '0.5',
    '--tmpfs', '/var/cache/nginx:uid=101,gid=101,mode=0700', '--tmpfs', '/var/run:uid=101,gid=101,mode=0700', '-p', `127.0.0.1:${hostingPort}:8443`,
    '--mount', `type=bind,source=${env.CODELESS_HOSTING_ROOT},target=/sites,readonly`,
    '--mount', `type=bind,source=${join(output, 'nginx.conf')},target=/etc/nginx/conf.d/default.conf,readonly`,
    '--mount', `type=bind,source=${join(output, 'tls/test-cert.pem')},target=/certs/server.pem,readonly`,
    '--mount', `type=bind,source=${join(output, 'tls/test-key.pem')},target=/certs/server.key,readonly`, 'nginx:1.27.5-alpine'])
  docker(['exec', hosting, 'nginx', '-t'])
  browser = start(process.execPath, ['node_modules/@playwright/test/cli.js', 'test', '--config', 'tests/e2e/full/playwright.full.config.ts'], env, join(output, 'browser.log'))
  const [exitCode, signal] = await once(browser, 'close')
  report.browserExitCode = exitCode; report.browserSignal = signal
  report.sql = JSON.parse(sql("SELECT json_build_object('applications',(SELECT json_agg(json_build_object('id',id,'ownerId',owner_id,'latestReadyVersionId',latest_ready_version_id)) FROM applications),'tasks',(SELECT json_agg(json_build_object('id',id,'applicationId',application_id,'status',status,'failureCode',failure_code)) FROM generation_tasks),'builds',(SELECT json_agg(json_build_object('id',id,'taskId',task_id,'versionId',version_id,'status',status,'exitCode',exit_code,'artifactDigest',artifact_digest)) FROM builds),'publications',(SELECT json_agg(json_build_object('id',id,'applicationId',application_id,'versionId',version_id,'status',status)) FROM publications),'models',(SELECT json_agg(json_build_object('provider',provider,'status',status,'inputTokens',input_tokens,'outputTokens',output_tokens)) FROM model_calls))"))
  assert.equal(exitCode, 0, 'Full browser regression failed; inspect browser.log and browser/ trace')
  assert.equal(signal, null)
  assert.equal(new Set(report.sql.applications.map(a => a.ownerId)).size, 2)
  assert.equal(report.sql.applications.length, 2)
  assert.equal(report.sql.tasks.length, 5)
  assert.equal(report.sql.tasks.filter(t => t.status === 'READY').length, 4)
  assert.equal(report.sql.tasks.filter(t => t.status === 'FAILED' && t.failureCode === 'AGENT_BUILD_EXIT').length, 1)
  assert.equal(report.sql.publications.length, 2)
  assert.ok(report.sql.publications.every(p => p.status === 'PUBLISHED'))
  assert.equal(report.sql.builds.filter(b => b.status === 'SUCCEEDED' && b.exitCode === 0).length, 4)
  assert.equal(report.sql.builds.filter(b => b.status === 'FAILED' && b.exitCode !== null && b.exitCode !== 0).length, 1)
  assert.ok(report.sql.models.length > 0 && report.sql.models.every(m => m.provider === 'deterministic-mock'))
  report.status = 'PASSED'
} catch (error) {
  report.status = 'FAILED'; report.error = error.stack; console.error(error)
} finally {
  report.cleanupErrors = []
  for (const [name, cleanup] of [['browser', () => stop(browser)], ['api', () => stop(api)], ['runtime', () => runtime?.close()], ['tls', () => tls && closeServer(tls)]]) {
    try { await cleanup() } catch (error) { report.cleanupErrors.push({ resource: name, error: error.message }) }
  }
  for (const [name, id] of [['hosting', hosting], ['database', database]]) if (id) {
    try {
      const info = JSON.parse(docker(['inspect', id]))[0]
      assert.equal(info.Id, id); assert.equal(info.Config.Labels['codeless.test'], 'd20-full')
      docker(['rm', '-f', id]); report[name + 'Removed'] = true
    } catch (error) { report.cleanupErrors.push({ resource: name, error: error.message }) }
  }
  if (report.cleanupErrors.length) report.status = 'FAILED'
  report.completedAt = new Date().toISOString()
  report.changedSources = []
  for (const [p, value] of Object.entries(report.sources)) {
    try { if (sha(await readFile(join(root, p))) !== value) report.changedSources.push(p) }
    catch { report.changedSources.push(p) }
  }
  report.endChanges = run('git', ['status', '--porcelain'])
  report.canonical = report.changes === '' && report.endChanges === '' && run('git', ['rev-parse', 'HEAD']) === report.revision && !report.changedSources.length
  await writeFile(join(output, 'run.json'), JSON.stringify(report, null, 2) + '\n')
  console.log(JSON.stringify({ output, status: report.status, browserExitCode: report.browserExitCode, error: report.error?.split('\n')[0] }))
  process.exitCode = report.status === 'PASSED' ? 0 : 1
}
