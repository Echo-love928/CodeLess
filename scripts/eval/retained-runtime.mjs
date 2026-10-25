// Restore exported original samples into a fresh loopback-only runtime. No model calls here.
import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import { mkdir, readFile, writeFile, cp, lstat, open, readdir } from 'node:fs/promises'
import { join, resolve, delimiter, sep } from 'node:path'
import { createHash, randomUUID } from 'node:crypto'
import { createServer } from 'node:net'
import { pathToFileURL } from 'node:url'
import { javaHome, secretOccurrences, gitState } from './run-batch.mjs'
import { root } from './lib.mjs'

const hash = bytes => 'sha256:' + createHash('sha256').update(bytes).digest('hex')
const readJSON = async path => JSON.parse(await readFile(path, 'utf8'))
const pause = ms => new Promise(done => setTimeout(done, ms))
function command(name, args, options = {}) {
  const r = spawnSync(name, args, { cwd: root, encoding: 'utf8', windowsHide: true, timeout: 120000, ...options })
  assert.equal(r.status, 0, 'Runtime prerequisite failed: ' + name + ' ' + args[0] + ': ' + (r.stderr ?? '').slice(-500))
  return r.stdout.trim()
}
async function freePort() {
  const server = createServer(); await new Promise(done => server.listen(0, '127.0.0.1', done))
  const port = server.address().port; await new Promise(done => server.close(done)); return port
}
async function login(base, email, password) {
  let cookie = ''
  const request = async (path, options = {}) => {
    const r = await fetch(base + path, { ...options, redirect: 'error', headers: { Cookie: cookie, ...options.headers }, signal: AbortSignal.timeout(10000) })
    const set = r.headers.getSetCookie().find(v => v.startsWith('JSESSIONID='))
    if (set) cookie = set.split(';')[0]
    assert.equal(r.status, 200, 'Login failed: HTTP ' + r.status)
    return r.json()
  }
  const { token } = await request('auth/csrf')
  const user = await request('auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': token }, body: JSON.stringify({ email, password }) })
  return { cookie, csrf: token, user }
}
export async function startRuntime(retainedRoot, output, mode, env = process.env) {
  assert.ok(['REAL', 'MOCK'].includes(mode))
  if (mode === 'REAL') assert.ok(env.CODELESS_MODEL_API_KEY && env.CODELESS_MODEL_NAME, 'REAL runtime needs existing environment credentials')
  await mkdir(output, { recursive: false })
  const samples = []
  for (const id of ['SHOW-01', 'SHOW-02', 'TASK-01']) {
    const directory = resolve(retainedRoot, id)
    let retained
    try { retained = await readJSON(join(directory, 'retained.json')) } catch (e) { if (mode === 'MOCK' && e.code === 'ENOENT') continue; throw e }
    assert.equal(retained.sampleId, id); assert.equal(retained.mode, mode)
    assert.ok(retained.application?.id && retained.task?.id && retained.files.length)
    for (const file of retained.files) {
      const full = resolve(directory, file.path)
      assert.ok(full.startsWith(directory + sep) && !file.path.includes('..') && !(await lstat(full)).isSymbolicLink())
      assert.equal(hash(await readFile(full)), file.sha256, id + ': retained byte mismatch')
    }
    samples.push({ ...retained, directory })
  }
  assert.ok(samples.length && new Set(samples.map(s => s.application.ownerId)).size === 1)
  assert.equal(new Set(samples.map(s => s.batchId)).size, 1)
  const platformRevision = command('git', ['rev-parse', 'HEAD'])
  if (mode === 'REAL') {
    assert.ok(gitState().scopedClean, 'REAL restore needs a committed clean platform scope')
    assert.ok(samples.every(s => s.platformRevision === platformRevision), 'Restore runtime must use the exact original platform commit')
  }
  // Build only, with credentials stripped. A fixed checkout must not depend on an operator's temporary classpath.
  const classpathFile = join(output, 'classpath.txt')
  const buildEnv = Object.fromEntries(Object.entries(env).filter(([key]) => !/CODELESS_|API_KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL|JAVA_TOOL_OPTIONS|JDK_JAVA_OPTIONS|_JAVA_OPTIONS/.test(key)))
  buildEnv.JAVA_HOME = javaHome(env)
  const mavenArgs = ['-f', 'services/api/pom.xml', '-DskipTests', 'test-compile', 'org.apache.maven.plugins:maven-dependency-plugin:3.10.0:build-classpath', '-DincludeScope=test', '-Dmdep.outputFile=' + classpathFile]
  command(process.platform === 'win32' ? (env.ComSpec ?? 'cmd.exe') : './services/api/mvnw',
    process.platform === 'win32' ? ['/d', '/c', 'services\\api\\mvnw.cmd', ...mavenArgs] : mavenArgs, { env: buildEnv, timeout: 600000, maxBuffer: 8388608 })
  const ownerId = samples[0].application.ownerId
  const container = 'codeless-d21-edit-' + randomUUID().slice(0, 8), dbPassword = randomUUID() + randomUUID()
  const privateRoot = join(output, 'private'), models = join(output, 'models')
  await mkdir(privateRoot); await mkdir(models)
  const image = 'postgres:17.6-alpine@sha256:ef257d85f76e48da1c64832459b59fcaba1a4dac97bf5d7450c77753542eee94'
  command('docker', ['run', '--detach', '--name', container, '--publish', '127.0.0.1::5432', '--env', 'POSTGRES_PASSWORD', '--env', 'POSTGRES_USER=codeless_test', '--env', 'POSTGRES_DB=codeless_test', image], { env: { ...env, POSTGRES_PASSWORD: dbPassword } })
  const state = { schemaVersion: 1, batchId: samples[0].batchId, platformRevision, mode, container, status: 'RESTORING', ownerId, samples: samples.map(s => s.sampleId) }
  const save = () => writeFile(join(output, 'runtime.json'), JSON.stringify(state, null, 2) + '\n')
  await save()
  for (let i = 0; i < 60; i++) {
    const check = spawnSync('docker', ['exec', container, 'pg_isready', '-h', '127.0.0.1', '-U', 'codeless_test'], { windowsHide: true })
    if (check.status === 0) break
    assert.ok(i < 59, 'Restore database startup deadline'); await pause(500)
  }
  const restore = sql => command('docker', ['exec', '-i', container, 'psql', '-U', 'codeless_test', '-d', 'codeless_test', '-v', 'ON_ERROR_STOP=1'], { input: sql, maxBuffer: 8388608 })
  restore(await readFile(join(samples[0].directory, 'schema.sql'), 'utf8'))
  for (const sample of samples) {
    restore('BEGIN; SET LOCAL session_replication_role=replica;\n' + await readFile(join(sample.directory, 'database.sql'), 'utf8') + '\nCOMMIT;')
    for (const [source, destination] of [...['versions', 'journal'].map(sub => [join(sample.directory, 'private', sub), join(privateRoot, sub)]), [join(sample.directory, 'models'), models]]) {
      await mkdir(destination, { recursive: true })
      for (const entry of await readdir(source)) await cp(join(source, entry), join(destination, entry), { recursive: true, force: false, errorOnExist: true })
    }
  }
  const dbPort = command('docker', ['port', container, '5432/tcp']).split(':').at(-1)
  const port = await freePort(), base = 'http://127.0.0.1:' + port + '/api/v0/'
  const ownerPassword = randomUUID() + randomUUID(), adminPassword = randomUUID() + randomUUID()
  const runtimeEnv = Object.fromEntries(Object.entries(env).filter(([key]) => !/^(?:CODELESS_|SPRING_|JAVA_TOOL_OPTIONS$|JDK_JAVA_OPTIONS$|_JAVA_OPTIONS$)/i.test(key)))
  Object.assign(runtimeEnv, { CODELESS_DATABASE_URL: 'jdbc:postgresql://127.0.0.1:' + dbPort + '/codeless_test',
    CODELESS_DATABASE_USER: 'codeless_test', CODELESS_DATABASE_PASSWORD: dbPassword, CODELESS_COOKIE_SECURE: 'false',
    CODELESS_MODEL_PROVIDER: mode === 'REAL' ? 'deepseek' : 'deterministic-mock', CODELESS_MODEL_AUDIT_ROOT: models,
    CODELESS_EVAL_OWNER_EMAIL: 'd21-eval-' + ownerId + '@eval.codeless.test', CODELESS_EVAL_OWNER_PASSWORD: ownerPassword, CODELESS_EVAL_ADMIN_PASSWORD: adminPassword })
  if (mode === 'REAL') Object.assign(runtimeEnv, { CODELESS_MODEL_API_KEY: env.CODELESS_MODEL_API_KEY, CODELESS_MODEL_NAME: env.CODELESS_MODEL_NAME })
  const classpath = [join(root, 'services/api/target/test-classes'), join(root, 'services/api/target/classes'), (await readFile(classpathFile, 'utf8')).trim()].join(delimiter)
  const log = await open(join(output, 'api.log'), 'wx')
  const child = spawn(join(javaHome(env), 'bin', 'java'), ['-cp', classpath, 'dev.codeless.api.eval.RetainedEvalRuntime',
    '--server.address=127.0.0.1', '--server.port=' + port, '--codeless.agent.enabled=true', '--codeless.agent.repository-root=' + root,
    '--codeless.agent.private-root=' + privateRoot, '--codeless.recovery.sweep-enabled=false', '--codeless.deploy.worker-enabled=false',
    '--CODELESS_FILE_WORKSPACE_ROOT=' + join(output, 'workspaces'), '--CODELESS_FILE_AUDIT_ROOT=' + join(output, 'file-audit')],
    { cwd: root, env: runtimeEnv, windowsHide: true, stdio: ['ignore', log.fd, log.fd] })
  await log.close(); state.pid = child.pid; state.api = base; await save()
  let owner, audit
  for (let i = 0; i < 90; i++) {
    assert.equal(child.exitCode, null, 'Runtime exited; inspect private api.log')
    try { owner = await login(base, runtimeEnv.CODELESS_EVAL_OWNER_EMAIL, ownerPassword); audit = await login(base, 'd21-audit@eval.codeless.test', adminPassword); break }
    catch { assert.ok(i < 89, 'Runtime login deadline; inspect private api.log'); await pause(1000) }
  }
  assert.equal(owner.user.id, ownerId); assert.equal(audit.user.role, 'ADMIN')
  const get = async (path, admin = false) => {
    const r = await fetch(base + path, { headers: { Cookie: admin ? audit.cookie : owner.cookie }, redirect: 'error' }); assert.equal(r.status, 200); return r.json()
  }
  const identities = []
  for (const sample of samples) {
    const app = await get('applications/' + sample.application.id)
    assert.equal(app.latestReadyVersionId, sample.application.latestReadyVersionId)
    for (const original of sample.versions) {
      const restored = await get('versions/' + original.id)
      for (const key of ['id', 'number', 'status', 'sourceDigest', 'buildId']) assert.equal(restored[key] ?? null, original[key] ?? null)
      assert.equal(restored.taskId, original.sourceTaskId); assert.equal(restored.applicationId, sample.application.id)
    }
    const calls = await get('admin/model-calls?taskId=' + sample.task.id + '&page=0&size=100', true)
    assert.ok(calls.items.length && calls.items.every(c => c.taskId === sample.task.id))
    identities.push({ sampleId: sample.sampleId, applicationId: app.id, taskId: sample.task.id, versionId: app.latestReadyVersionId, versions: sample.versions.length, modelCalls: calls.items.length })
  }
  await writeFile(join(output, 'restoration-check.json'), JSON.stringify({ batchId: state.batchId, mode, status: 'PASSED', identities }, null, 2) + '\n')
  await writeFile(join(output, 'session.private.json'), JSON.stringify({ api: base, owner, audit }), { mode: 0o600, flag: 'wx' })
  assert.deepEqual(secretOccurrences([output], env.CODELESS_MODEL_API_KEY), [])
  state.status = 'READY_FOR_PREFLIGHT'; await save()
  console.log(JSON.stringify({ output, status: state.status, identities, modelRequests: 0 }))
  return { child, container, state }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [retained, output, mode] = process.argv.slice(2)
  try { const runtime = await startRuntime(resolve(retained), resolve(output), mode); await new Promise(done => runtime.child.once('close', done)) }
  catch (error) { console.error(error.message); process.exitCode = 1 }
}
