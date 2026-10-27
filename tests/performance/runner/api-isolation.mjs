// Real production HTTP/API + fresh PostgreSQL, with separately isolated worker fault loads.
// This measures worker-to-API interference; D22-A owns HTTP generation admission limits.
import assert from 'node:assert/strict'
import { once } from 'node:events'
import { createServer } from 'node:net'
import { randomUUID } from 'node:crypto'
import { mkdir, mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { performance } from 'node:perf_hooks'
import { prepare } from '../../e2e/full/prepare.mjs'
import { start, stop, windows } from '../../e2e/full/support.mjs'
import { createBuildRunner } from '../../../services/runner/src/build/runner.mjs'
import { root, command, docker, dockerAsync, machine, codeIdentity, sleep, ownedPath, observeOOM } from './support.mjs'

const output = join(root, '.local-data/d22-b/api-' + new Date().toISOString().replaceAll(':', '-') + '-' + randomUUID())
await mkdir(output, { recursive: true }); console.log('D22-B API evidence: ' + output)
const report = { task: 'D22-B-T2', status: 'RUNNING', startedAt: new Date().toISOString(), samples: [], faults: [],
  modelProvider: 'deterministic-mock', modelRequests: 0, scope: 'production API reads under one isolated worker CPU timeout and actual cgroup OOM; not HTTP task-admission integration' }
let database, api, scratch
const faultTag = 'codeless-d22-api-fault:' + randomUUID()
try {
  report.revision = command('git', ['rev-parse', 'HEAD']); report.startChanges = command('git', ['status', '--porcelain'])
  report.sources = await codeIdentity()
  const { env, classpath } = prepare()
  report.machine = machine()
  docker(['build', '-f', 'tests/runner/build/fixtures/Dockerfile', '-t', faultTag, '.'])
  const faultImage = docker(['image', 'inspect', faultTag, '--format', '{{.Id}}'])
  report.faultImage = faultImage
  const portServer = createServer(); portServer.listen(0, '127.0.0.1'); await once(portServer, 'listening')
  const port = portServer.address().port; await new Promise(done => portServer.close(done))
  database = docker(['run', '-d', '--name', 'codeless-d22-db-' + randomUUID(), '--label', 'codeless.test=d22-api',
    '-p', '127.0.0.1::5432', '-e', 'POSTGRES_USER=d22_test', '-e', 'POSTGRES_PASSWORD=fixture-only-d22', '-e', 'POSTGRES_DB=d22_test',
    'postgres:17.6-alpine@sha256:ef257d85f76e48da1c64832459b59fcaba1a4dac97bf5d7450c77753542eee94'])
  report.databaseId = database
  const dbPort = JSON.parse(docker(['inspect', database]))[0].NetworkSettings.Ports['5432/tcp'][0].HostPort
  const dbDeadline = Date.now() + 15000
  while (true) {
    try { await dockerAsync(['exec', database, 'pg_isready', '-U', 'd22_test', '-d', 'd22_test']); break } catch {
      assert.ok(Date.now() < dbDeadline, 'PostgreSQL readiness deadline'); await sleep(100)
    }
  }
  Object.assign(env, { CODELESS_DATABASE_URL: `jdbc:postgresql://127.0.0.1:${dbPort}/d22_test`,
    CODELESS_DATABASE_USER: 'd22_test', CODELESS_DATABASE_PASSWORD: 'fixture-only-d22', CODELESS_COOKIE_SECURE: 'false',
    CODELESS_DEMO_PASSWORD: 'demo-password-for-test-only', CODELESS_ADMIN_PASSWORD: 'admin-password-for-test-only',
    CODELESS_MODEL_PROVIDER: 'deterministic-mock', CODELESS_MODEL_AUDIT_ROOT: join(output, 'model-audit'),
    CODELESS_ADMIN_AUDIT_ROOT: join(output, 'admin-audit') })
  api = start(join(env.JAVA_HOME, 'bin', windows ? 'java.exe' : 'java'), ['-cp', classpath, 'dev.codeless.api.CodeLessApiApplication',
    '--server.address=127.0.0.1', '--server.port=' + port, '--codeless.agent.enabled=false',
    '--codeless.agent.private-root=' + join(output, 'private')], env, join(output, 'api.log'))
  report.apiPid = api.pid
  const origin = 'http://127.0.0.1:' + port, deadline = Date.now() + 60000
  let csrfResponse
  while (true) {
    assert.equal(api.exitCode, null, 'API exited; inspect api.log')
    try { const value = await fetch(origin + '/api/v0/auth/csrf', { signal: AbortSignal.timeout(1000) }); if (value.status === 200) { csrfResponse = value; break } } catch {}
    assert.ok(Date.now() < deadline, 'API startup deadline'); await sleep(200)
  }
  let cookie = csrfResponse.headers.getSetCookie().map(c => c.split(';')[0]).join('; ')
  const csrf = (await csrfResponse.json()).token
  const login = await fetch(origin + '/api/v0/auth/login', { method: 'POST', headers: { Cookie: cookie, 'X-CSRF-Token': csrf, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'demo@codeless.local', password: 'demo-password-for-test-only' }), signal: AbortSignal.timeout(2000) })
  assert.equal(login.status, 200); await login.json()
  if (login.headers.getSetCookie().length) cookie = login.headers.getSetCookie().map(c => c.split(';')[0]).join('; ')
  async function probe(phase, containerId) {
    const running = containerId ? JSON.parse(await dockerAsync(['inspect', containerId, '--format', '{{json .State}}'])).Running : null
    if (containerId) assert.equal(running, true, 'probe must overlap a running fault cgroup')
    for (let i = 0; i < 10; i++) {
      const path = i % 2 ? '/api/v0/applications' : '/api/v0/auth/me', begin = performance.now()
      const response = await fetch(origin + path, { headers: { Cookie: cookie }, signal: AbortSignal.timeout(2000) })
      const body = await response.json(), elapsedMs = performance.now() - begin
      report.samples.push({ phase, path, status: response.status, elapsedMs, containerId: containerId ?? null, runningAtStart: running })
      assert.equal(response.status, 200, JSON.stringify(body)); assert.ok(elapsedMs < 2000)
    }
  }
  await probe('baseline')
  scratch = await mkdtemp(join(tmpdir(), 'codeless-d22-api-'))
  for (const mode of ['timeout', 'memory']) {
    let probeResult
    const run = await createBuildRunner({ workRoot: join(scratch, 'work'), artifactRoot: join(scratch, 'artifacts'), imageId: faultImage,
      limits: mode === 'timeout' ? { timeoutMs: 8000 } : { memoryMiB: 96, timeoutMs: 15000 },
      onContainerCreated(id) {
        probeResult = (async () => {
          const end = Date.now() + 5000
          while (!JSON.parse(await dockerAsync(['inspect', id, '--format', '{{json .State}}'])).Running) {
            assert.ok(Date.now() < end, 'fault startup deadline'); await sleep(30)
          }
          await probe(mode, id)
          if (mode === 'memory') return observeOOM(id)
        })().then(value => ({ value }), error => ({ error: error.message }))
      } })
    const result = await run(join(root, 'tests/runner/build/fixtures', mode))
    const observed = await probeResult; report.faults.push({ mode, result, observed })
    assert.ok(observed, JSON.stringify(result))
    assert.equal(observed.error, undefined); assert.equal(result.failure, mode === 'timeout' ? 'TIMEOUT' : 'OOM', JSON.stringify(result))
    assert.equal(result.exitCode, 137); assert.equal(result.artifact, null)
    assert.deepEqual(result.cleanup, { containerRemoved: true, workspaceRemoved: true, errors: [] })
    assert.equal(docker(['ps', '-a', '--filter', `name=^/${result.containerName}$`, '--format', '{{.ID}}']), '')
  }
  await probe('after')
  report.status = 'PASSED'
} catch (error) { report.status = 'FAILED'; report.error = error.stack; console.error(error) }
finally {
  report.cleanupErrors = []
  try { await stop(api); report.apiRemoved = true } catch (error) { report.cleanupErrors.push(error.message) }
  try {
    if (database) {
      assert.equal(JSON.parse(docker(['inspect', database]))[0].Config.Labels['codeless.test'], 'd22-api')
      docker(['rm', '-f', database]); report.databaseRemoved = true
    }
    if (scratch) await rm(ownedPath(tmpdir(), scratch), { recursive: true, force: true })
    docker(['image', 'rm', faultTag]); report.imageAliasRemoved = true
  } catch (error) { report.cleanupErrors.push(error.message) }
  if (report.cleanupErrors.length) report.status = 'FAILED'
  report.canonical = report.startChanges === '' && command('git', ['status', '--porcelain']) === '' &&
    command('git', ['rev-parse', 'HEAD']) === report.revision && JSON.stringify(report.sources) === JSON.stringify(await codeIdentity())
  report.completedAt = new Date().toISOString()
  await writeFile(join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n')
  process.exitCode = report.status === 'PASSED' ? 0 : 1
}
