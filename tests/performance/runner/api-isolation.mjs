// Real production HTTP/API + fresh PostgreSQL, with separately isolated worker fault loads.
// This measures worker-to-API interference; D22-A owns HTTP generation admission limits.
import assert from 'node:assert/strict'
import { once } from 'node:events'
import { createServer } from 'node:net'
import { randomUUID } from 'node:crypto'
import { mkdir, mkdtemp, readFile, realpath, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, dirname, basename } from 'node:path'
import { performance } from 'node:perf_hooks'
import { prepare } from '../../e2e/full/prepare.mjs'
import { start, stop, windows } from '../../e2e/full/support.mjs'
import { createBuildRunner } from '../../../services/runner/src/build/runner.mjs'
import { root, sha, command, docker, dockerAsync, machine, codeIdentity, sleep, ownedPath, waitForOOM } from './support.mjs'

const output = join(root, '.local-data/d22-b/api-' + new Date().toISOString().replaceAll(':', '-') + '-' + randomUUID())
await mkdir(output, { recursive: true }); console.log('D22-B API evidence: ' + output)
const report = { task: 'D22-B-T2', status: 'RUNNING', startedAt: new Date().toISOString(), samples: [], faults: [],
  modelProvider: 'deterministic-mock', modelRequests: 0, scope: 'production API reads after independently confirmed CPU/OOM barriers and after cleanup; explicit pre-pressure negative control is not an OOM sample',
  faultFixture: 'D07 real victim/guardian, memory allocation held by host release file and then delayed 500ms' }
let database, api, scratch
const faultTag = 'codeless-d22-api-fault:' + randomUUID()
async function apiSources() {
  const paths = command('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z', '--', 'services/api/src/main']).split('\0').filter(Boolean)
  return Object.fromEntries(await Promise.all(paths.map(async path => [path, sha(await readFile(join(root, path)))])))
}
try {
  report.revision = command('git', ['rev-parse', 'HEAD']); report.startChanges = command('git', ['status', '--porcelain'])
  report.sources = await codeIdentity()
  report.apiSources = await apiSources()
  const { env, classpath } = prepare()
  report.machine = machine()
  docker(['build', '-f', 'tests/performance/runner/fixtures/Dockerfile', '-t', faultTag, '.'])
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
  async function probe(phase, containerId, barrier = null) {
    const running = containerId ? JSON.parse(await dockerAsync(['inspect', containerId, '--format', '{{json .State}}'])).Running : null
    if (containerId) assert.equal(running, true, 'probe must overlap a running fault cgroup')
    for (let i = 0; i < 10; i++) {
      const path = i % 2 ? '/api/v0/applications' : '/api/v0/auth/me', begin = performance.now(), startedAt = new Date().toISOString()
      if (barrier) assert.ok(begin >= barrier.monotonicMs, 'HTTP sample must follow its independently observed barrier')
      const response = await fetch(origin + path, { headers: { Cookie: cookie }, signal: AbortSignal.timeout(2000) })
      const body = await response.json(), elapsedMs = performance.now() - begin
      report.samples.push({ phase, path, status: response.status, elapsedMs, startedAt, completedAt: new Date().toISOString(),
        monotonicStartMs: begin, monotonicEndMs: performance.now(), barrierKind: barrier?.kind ?? null,
        barrierMonotonicMs: barrier?.monotonicMs ?? null, containerId: containerId ?? null, runningAtGroupStart: running })
      assert.equal(response.status, 200, JSON.stringify(body)); assert.ok(elapsedMs < 2000)
    }
  }
  await probe('baseline')
  scratch = await mkdtemp(join(tmpdir(), 'codeless-d22-api-'))
  const state = async id => JSON.parse(await dockerAsync(['inspect', id, '--format', '{{json .State}}']))
  const cgroup = async (id, file) => JSON.parse(await dockerAsync(['exec', id, 'node', '-e',
    `console.log(JSON.stringify(require('node:fs').readFileSync('/sys/fs/cgroup/${file}','utf8')))`]))
  const counter = (text, key) => Number(text.match(new RegExp('^' + key + ' (\\d+)$', 'm'))?.[1])
  for (const mode of ['timeout', 'memory-control', 'memory']) {
    let probeResult
    const run = await createBuildRunner({ workRoot: join(scratch, 'work'), artifactRoot: join(scratch, 'artifacts'), imageId: faultImage,
      limits: mode === 'timeout' ? { timeoutMs: 8000 } : { memoryMiB: 96, timeoutMs: 15000 },
      onContainerCreated(id) {
        probeResult = (async () => {
          const end = Date.now() + 5000
          while (!(await state(id)).Running) {
            assert.ok(Date.now() < end, 'fault startup deadline'); await sleep(30)
          }
          if (mode === 'timeout') {
            const top = await dockerAsync(['top', id, '-eo', 'pid,ppid,args'])
            assert.match(top, /node\s+-e\s+while\(true\)/, 'real CPU-loop child must have started')
            const before = await cgroup(id, 'cpu.stat'); await sleep(250)
            const after = await cgroup(id, 'cpu.stat')
            assert.ok(counter(after, 'usage_usec') - counter(before, 'usage_usec') > 100000, 'CPU usage must actually grow before HTTP samples')
            const barrier = { kind: 'CPU_USAGE_AND_LOOP_CHILD', monotonicMs: performance.now(), observedAt: new Date().toISOString(), top, before, after }
            await probe('timeout-after-cpu-barrier', id, barrier)
            const afterQueries = await state(id)
            assert.equal(afterQueries.Running, true)
            return { barrier, afterQueries }
          }
          const inspected = JSON.parse(await dockerAsync(['inspect', id]))[0]
          const mount = inspected.Mounts.find(m => m.Destination === '/output' && m.RW)
          const outputRoot = await realpath(mount.Source)
          const stagingRoot = await realpath(process.platform === 'win32' ? tmpdir() : join(scratch, 'work'))
          assert.equal(dirname(dirname(outputRoot)), stagingRoot)
          assert.match(basename(dirname(outputRoot)), /^codeless-build-[A-Za-z0-9]+$/)
          const armedDeadline = Date.now() + 5000
          while (true) {
            try { assert.deepEqual(JSON.parse(await readFile(join(outputRoot, 'armed.json'))), { armed: true, pressureReleased: false }); break }
            catch (error) { if (error.code !== 'ENOENT') throw error; assert.ok(Date.now() < armedDeadline); await sleep(20) }
          }
          const held = { kind: 'PRESSURE_HELD_NEGATIVE_CONTROL', monotonicMs: performance.now(), observedAt: new Date().toISOString() }
          if (mode === 'memory-control') {
            await probe('memory-control-before-pressure-release', id, held)
            assert.equal((await state(id)).OOMKilled, false)
            await assert.rejects(readFile(join(outputRoot, 'release-pressure')), { code: 'ENOENT' })
          }
          await writeFile(join(outputRoot, 'release-pressure'), 'host-controlled release', { flag: 'wx' })
          const release = { monotonicMs: performance.now(), observedAt: new Date().toISOString() }
          const observedOOM = await waitForOOM(id)
          const events = await cgroup(id, 'memory.events'), memoryMax = await cgroup(id, 'memory.max')
          assert.ok(counter(events, 'oom_kill') > 0); assert.equal(Number(memoryMax.trim()), 96 * 1024 * 1024)
          const barrier = { ...observedOOM, kind: 'RUNNING_OOMKILLED_AND_CGROUP_OOM_KILL', events, memoryMax }
          assert.ok(barrier.monotonicMs > release.monotonicMs)
          if (mode === 'memory') await probe('memory-after-oom-confirmation', id, barrier)
          const afterQueries = await state(id)
          assert.equal(afterQueries.Running, true); assert.equal(afterQueries.OOMKilled, true)
          await dockerAsync(['kill', '--signal', 'USR2', id])
          return { held, release, barrier, afterQueries, controlOnly: mode === 'memory-control' }
        })().then(value => ({ value }), error => ({ error: error.message }))
      } })
    const result = await run(join(root, 'tests/runner/build/fixtures', mode === 'memory-control' ? 'memory' : mode))
    const observed = await probeResult; report.faults.push({ mode, result, observed })
    assert.ok(observed, JSON.stringify(result))
    assert.equal(observed.error, undefined); assert.equal(result.failure, mode === 'timeout' ? 'TIMEOUT' : 'OOM', JSON.stringify(result))
    assert.equal(result.exitCode, 137); assert.equal(result.artifact, null)
    assert.deepEqual(result.cleanup, { containerRemoved: true, workspaceRemoved: true, errors: [] })
    assert.equal(docker(['ps', '-a', '--filter', `name=^/${result.containerName}$`, '--format', '{{.ID}}']), '')
    await probe(mode + '-after-cleanup')
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
  report.apiSourceChanges = JSON.stringify(report.apiSources) !== JSON.stringify(await apiSources())
  if (report.apiSourceChanges) report.status = 'FAILED'
  report.canonical = report.startChanges === '' && command('git', ['status', '--porcelain']) === '' &&
    command('git', ['rev-parse', 'HEAD']) === report.revision && JSON.stringify(report.sources) === JSON.stringify(await codeIdentity())
  report.completedAt = new Date().toISOString()
  await writeFile(join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n')
  process.exitCode = report.status === 'PASSED' ? 0 : 1
}
