import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { mkdir, writeFile, readFile } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { createBuildRunner } from '../../../services/runner/src/build/runner.mjs'
import { createBrowserVerifier } from '../../../services/runner/src/verify/verifier.mjs'
import { readSnapshot } from '../../../services/runner/src/artifacts/snapshot.mjs'
import { openArtifactService } from '../../../services/runner/src/artifacts/service.mjs'

// Explicit source fixture provider. Build/container/browser results below are real.
// No platform database, model, task API or signing authority is simulated as real.
const root = process.cwd(), output = resolve(process.argv[2])
await mkdir(output, { recursive: true })
const tag = 'codeless-d10-generation:' + randomUUID()
function docker(args) {
  const value = spawnSync('docker', args, { cwd: root, encoding: 'utf8', windowsHide: true, timeout: 70000 })
  assert.equal(value.status, 0, value.stderr || value.error?.message)
  return value.stdout.trim()
}
docker(['build', '-f', 'infra/build-image/Dockerfile', '-t', tag, '.'])
try {
  const imageId = docker(['image', 'inspect', tag, '--format', '{{.Id}}'])
  const build = await createBuildRunner({ workRoot: join(output, 'work'), artifactRoot: join(output, 'artifacts'), imageId })
  const verify = await createBrowserVerifier({ evidenceRoot: join(output, 'verification') })
  const source = join(output, 'source')
  await mkdir(join(source, 'src/pages'), { recursive: true })
  const file = join(source, 'src/pages/HomePage.vue')
  // First candidate has a genuinely missing dependency. The fixture patch fixes that exact error.
  await writeFile(file, '<script setup lang="ts">import Missing from "../components/Missing.vue"</script><template><Missing /></template>')
  const failed = await build(source)
  assert.equal(failed.status, 'FAILED'); assert.ok(failed.exitCode > 0)
  await writeFile(file, await readFile(join(root, 'templates/vue/fixtures/showcase/src/pages/HomePage.vue')))
  const snapshot = await readSnapshot(source, { source: true })
  const repaired = await build(source)
  assert.equal(repaired.status, 'SUCCEEDED'); assert.equal(repaired.exitCode, 0)
  const handle = await openArtifactService({ artifactRoot: join(output, 'artifacts'), build: repaired, sourceDigest: snapshot.manifest.digest })
  let passed, pageError
  try {
    passed = await verify(handle, [{ type: 'navigate', path: '/' }, { type: 'expectVisible', target: { role: 'heading', name: '林予安，设计与摄影' } }])
    assert.equal(passed.status, 'PASSED', JSON.stringify(passed))
    // Model claims completion; an actual wrong-page assertion must still fail after build exit 0.
    pageError = await verify(handle, [{ type: 'navigate', path: '/' }, { type: 'expectText', target: { role: 'heading', name: '林予安，设计与摄影' }, value: '不存在的验收标题' }])
    assert.equal(pageError.status, 'FAILED'); assert.equal(pageError.failure, 'ACTION_FAILED')
  } finally { await handle.close() }
  const detail = value => ({ id: value.id, status: value.status, exitCode: value.exitCode, artifactDigest: value.artifact?.digest ?? null, createdAt: value.createdAt, completedAt: value.completedAt })
  const manifest = { provider: 'd10-source-fixture', modelQualityAccepted: false, platformApiFixture: true, signingFixture: true,
    database: 'NOT_EXECUTED_BY_THIS_TEST', runtimeModelRequests: 0, automaticModelRepair: false,
    failed: detail(failed), repaired: detail(repaired), artifactDirectory: repaired.artifact.directory,
    sourceDigest: snapshot.manifest.digest, sourceFileDigest: snapshot.manifest.files.find(file => file.path === 'src/pages/HomePage.vue').digest,
    verification: { id: passed.id, status: passed.status, screenshot: passed.screenshot },
    pageError: { id: pageError.id, status: pageError.status, failure: pageError.failure } }
  await writeFile(join(output, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n')
  const artifact = await readSnapshot(repaired.artifact.directory)
  await writeFile(join(output, 'assets.json'), JSON.stringify(Object.fromEntries([...artifact.buffers].map(([path, bytes]) => [path, bytes.toString('base64')]))))
  console.log(JSON.stringify({ provider: manifest.provider, build: repaired.status, verification: passed.status, wrongPage: pageError.status }))
} finally { docker(['image', 'rm', tag]) }
