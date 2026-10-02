import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtemp, mkdir, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { after, before, test } from 'node:test'
import { capture, createBuildRunner, isolationArgs, summarizeArtifacts } from '../../../services/runner/src/build/runner.mjs'
import { policy } from '../../../infra/runner/policy.mjs'

const root = fileURLToPath(new URL('../../../', import.meta.url))
const fixture = (name) => join(root, 'tests/runner/build/fixtures', name)
let scratch, imageId
before(async () => {
  scratch = await mkdtemp(join(tmpdir(), 'codeless-d07-'))
  const build = spawnSync('docker', ['build', '--file', 'tests/runner/build/fixtures/Dockerfile', '--tag', 'codeless-build-fault:d07', '.'],
    { cwd: root, encoding: 'utf8', timeout: 60000 })
  assert.equal(build.status, 0, build.stderr)
  const inspect = spawnSync('docker', ['image', 'inspect', 'codeless-build-fault:d07', '--format', '{{.Id}}'], { encoding: 'utf8' })
  assert.equal(inspect.status, 0, inspect.stderr)
  imageId = inspect.stdout.trim()
})
after(async () => {
  if (scratch) {
    assert.equal(dirname(scratch), resolve(tmpdir()))
    await rm(scratch, { recursive: true, force: true })
  }
})

async function runner(options = {}, fault = true) {
  return createBuildRunner({ workRoot: join(scratch, 'work'), artifactRoot: join(scratch, 'artifacts'),
    ...(fault ? { imageId } : {}), ...options })
}
function clean(result) {
  assert.deepEqual(result.cleanup, { containerRemoved: true, workspaceRemoved: true, errors: [] })
}
async function evidence(label, result) {
  clean(result)
  console.log(`${label}: ${JSON.stringify(result)}`)
  if (process.env.CODELESS_BUILD_EVIDENCE_DIR) {
    await mkdir(process.env.CODELESS_BUILD_EVIDENCE_DIR, { recursive: true })
    await writeFile(join(process.env.CODELESS_BUILD_EVIDENCE_DIR, `${label}.json`), JSON.stringify(result, null, 2))
  }
}

test('D07-B-T1: controlled Vue template produces stable artifact digest and real logs', { timeout: 120000 }, async () => {
  const run = await runner({}, false)
  const result = await run(join(root, 'templates/vue/fixtures/showcase'))
  assert.equal(result.status, 'SUCCEEDED', JSON.stringify(result))
  assert.equal(result.exitCode, 0)
  assert.match(result.log.text, /vite|Vite/)
  assert.match(result.artifact.digest, /^sha256:[a-f0-9]{64}$/)
  const summary = await summarizeArtifacts(result.artifact.directory, policy())
  assert.equal(summary.digest, result.artifact.digest)
  await evidence('D07-B-T1', result)
  assert.deepEqual(await readdir(join(scratch, 'work')), [])
})

test('D07-B-T2: infinite loop and child process time out and container is removed', { timeout: 30000 }, async () => {
  const result = await (await runner({ limits: { timeoutMs: 1500 } }))(fixture('timeout'))
  assert.equal(result.status, 'FAILED')
  assert.equal(result.failure, 'TIMEOUT', JSON.stringify(result))
  assert.equal(result.timedOut, true)
  assert.equal(result.exitCode, 137)
  assert.equal(result.artifact, null)
  assert.match(result.log.text, /loop child started/)
  await evidence('D07-B-T2', result)
})

test('D07-B-T3: real cgroup OOM is distinguished from timeout and compiler failure', { timeout: 30000 }, async () => {
  const result = await (await runner({ limits: { memoryMiB: 96, timeoutMs: 15000 } }))(fixture('memory'))
  assert.equal(result.failure, 'OOM', JSON.stringify(result))
  assert.equal(result.oomKilled, true)
  assert.equal(result.exitCode, 137)
  assert.equal(result.timedOut, false)
  assert.equal(result.artifact, null)
  await evidence('D07-B-T3', result)
})

test('D07-B-T4: actual network, secrets, socket, root and input writes denied', { timeout: 30000 }, async () => {
  const prior = process.env.CODELESS_MODEL_API_KEY
  process.env.CODELESS_MODEL_API_KEY = 'd07-host-secret-must-stay-on-host'
  try {
    const result = await (await runner())(fixture('isolation'))
    assert.equal(result.status, 'SUCCEEDED', JSON.stringify(result))
    assert.match(result.log.text, /sensitive access denied/)
    await evidence('D07-B-T4', result)
  } finally {
    if (prior === undefined) delete process.env.CODELESS_MODEL_API_KEY
    else process.env.CODELESS_MODEL_API_KEY = prior
  }
})

test('stdout/stderr floods are drained and bounded without hiding the observed exit', async () => {
  const result = await (await runner({ limits: { logBytes: 1024 } }))(fixture('logs'))
  assert.equal(result.failure, 'BUILD_EXIT', JSON.stringify(result))
  assert.equal(result.exitCode, 7)
  assert.equal(result.log.bytes, 1024)
  assert.equal(result.log.observedBytes, 400000)
  assert.equal(result.log.truncated, true)
  assert.equal(result.artifact, null)
  clean(result)
})

test('nonzero, empty and symlink artifacts cannot become successful builds', async () => {
  for (const [name, failure, exitCode] of [['exit', 'BUILD_EXIT', 2], ['empty', 'ARTIFACT_INVALID', 0], ['symlink', 'ARTIFACT_INVALID', 0]]) {
    const result = await (await runner())(fixture(name))
    assert.equal(result.status, 'FAILED', JSON.stringify(result))
    assert.equal(result.failure, failure)
    assert.equal(result.exitCode, exitCode)
    assert.equal(result.artifact, null)
    clean(result)
  }
})

test('artifact size limits fail closed even after exit zero', async () => {
  const result = await (await runner({ limits: { artifactBytes: 1 } }))(fixture('isolation'))
  assert.equal(result.failure, 'ARTIFACT_INVALID', JSON.stringify(result))
  assert.equal(result.exitCode, 0)
  assert.equal(result.artifact, null)
  clean(result)
})

test('concurrent tasks have independent containers, workspaces and artifact directories', async () => {
  const run = await runner()
  const results = await Promise.all([run(fixture('isolation')), run(fixture('exit'))])
  assert.notEqual(results[0].containerName, results[1].containerName)
  assert.equal(results[0].status, 'SUCCEEDED', JSON.stringify(results[0]))
  assert.equal(results[1].failure, 'BUILD_EXIT', JSON.stringify(results[1]))
  results.forEach(clean)
  assert.deepEqual(await readdir(join(scratch, 'work')), [])
})

test('invalid source and missing image keep unknown exit null and clean scratch', async () => {
  const invalid = join(scratch, 'invalid')
  await mkdir(invalid)
  await writeFile(join(invalid, 'package.json'), '{}')
  const rejected = await (await runner())(invalid)
  assert.equal(rejected.exitCode, null)
  assert.equal(rejected.status, 'FAILED')
  clean(rejected)
  const missing = await (await runner({ imageId: `sha256:${'0'.repeat(64)}` }))(fixture('exit'))
  assert.equal(missing.exitCode, null)
  assert.equal(missing.status, 'FAILED')
  assert.match(missing.diagnostic, /create build container/)
  clean(missing)
})

test('worker policy refuses unpinned images, unknown limits and resource relaxation', async () => {
  for (const value of [{ memoryMiB: 513 }, { timeoutMs: 0 }, { shell: 1 }, { cpus: 1.5 }]) assert.throws(() => policy(value))
  await assert.rejects(runner({ imageId: 'untrusted:latest' }), /immutable/)
  const args = isolationArgs({ name: 'codeless-policy', input: '/worker/input', output: '/worker/output', user: '1000:1000', imageId, limits: policy() })
  assert.equal(args.includes('--entrypoint'), false)
  assert.equal(args.includes('--env'), false)
  assert.equal(args.at(-1), imageId)
  assert.equal(args.filter((arg) => arg.includes('type=bind')).length, 2)
  assert.equal(args.some((arg) => arg.includes('docker.sock')), false)
  const log = capture(4)
  log.append(Buffer.from('123456'))
  assert.deepEqual(log.result(), { text: '1234', bytes: 4, observedBytes: 6, truncated: true })
  const utf8 = capture(2)
  utf8.append(Buffer.from('中'))
  assert.equal(Buffer.byteLength(utf8.result().text) <= 2, true)
  const invalidUtf8 = capture(2)
  invalidUtf8.append(Buffer.from([255, 255]))
  assert.equal(Buffer.byteLength(invalidUtf8.result().text) <= 2, true)
})
