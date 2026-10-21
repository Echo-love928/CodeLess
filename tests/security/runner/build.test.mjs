import assert from 'node:assert/strict'
import { test, before, after } from 'node:test'
import { spawnSync } from 'node:child_process'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { createBuildRunner } from '../../../services/runner/src/build/runner.mjs'
import { evidence } from './evidence.mjs'
let root, imageId
function docker(args) {
  const result = spawnSync('docker', args, { encoding: 'utf8', timeout: 180000, windowsHide: true })
  assert.equal(result.status, 0, result.stderr); return result.stdout.trim()
}
before(() => {
  docker(['build', '-f', 'infra/build-image/Dockerfile', '-t', 'codeless-vue-build:d05', '.'])
  docker(['build', '-f', 'tests/security/runner/fixtures/Dockerfile', '-t', 'codeless-security-probe:d19', '.'])
  imageId = docker(['image', 'inspect', 'codeless-security-probe:d19', '--format', '{{.Id}}'])
})
before(async () => { root = await mkdtemp(join(tmpdir(), 'codeless-d19-build-')) })
after(async () => { if (root) { assert.equal(dirname(root), resolve(tmpdir())); await rm(root, { recursive: true, force: true }) } })
async function run(mode, timeoutMs) {
  const source = join(root, mode); await mkdir(join(source, 'src/data'), { recursive: true }); await mkdir(join(source, 'src/pages'))
  await writeFile(join(source, 'src/data/Mode.ts'), `export const mode = '${mode}'`)
  await writeFile(join(source, 'src/pages/HomePage.vue'), '<template><h1>Boundary fixture</h1></template>')
  const build = await createBuildRunner({ workRoot: join(root, 'work'), artifactRoot: join(root, 'artifacts'), imageId, limits: { timeoutMs } })
  return build(source)
}
test('D19 T1: real container denies external, management and metadata connections and host secrets', { timeout: 30000 }, async () => {
  const keys = ['CODELESS_MODEL_API_KEY', 'DATABASE_URL', 'AWS_SECRET_ACCESS_KEY']
  const previous = new Map(keys.map(key => [key, process.env[key]]))
  let result
  try {
    for (const key of keys) process.env[key] = 'explicit-d19-host-only-secret-fixture'
    result = await run('isolation', 10000)
  } finally {
    for (const [key, value] of previous) { if (value === undefined) delete process.env[key]; else process.env[key] = value }
  }
  assert.equal(result.status, 'SUCCEEDED', JSON.stringify(result)); assert.equal(result.exitCode, 0)
  const proof = JSON.parse(result.log.text.split('\n').find(line => line.startsWith('D19_ISOLATION ')).slice(14))
  assert.equal(proof.denied.length, 6); assert.equal(proof.secretsAbsent, true)
  assert.deepEqual(result.cleanup, { containerRemoved: true, workspaceRemoved: true, errors: [] })
  await evidence('T1-build-isolation', { result, proof })
})
test('D19 T2: timeout kills the container and its child; exact container is absent after cleanup', { timeout: 30000 }, async () => {
  const result = await run('timeout', 2000)
  assert.equal(result.status, 'FAILED'); assert.equal(result.failure, 'TIMEOUT', JSON.stringify(result))
  assert.equal(result.exitCode, 137); assert.equal(result.artifact, null)
  assert.match(result.log.text, /D19_CHILD_RUNNING/)
  assert.deepEqual(result.cleanup, { containerRemoved: true, workspaceRemoved: true, errors: [] })
  const remaining = docker(['ps', '-a', '--filter', `name=^/${result.containerName}$`, '--format', '{{.ID}}'])
  assert.equal(remaining, '')
  const inspected = spawnSync('docker', ['inspect', result.containerName], { encoding: 'utf8', windowsHide: true })
  assert.equal(inspected.status, 1); assert.match(inspected.stderr, /No such (object|container)/i)
  await evidence('T2-container-timeout', { result, remaining, inspectExit: inspected.status, runtime: 'Docker removes all processes in the owned container PID namespace' })
})
