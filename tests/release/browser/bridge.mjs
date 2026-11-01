// Real build/Chromium through the shipped Java/IPC bridge; no API route fixtures.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve, join, relative, isAbsolute } from 'node:path'
import { root, verify, command, hash } from '../../../infra/release/client/package.mjs'
import { readSnapshot } from '../../../services/runner/src/artifacts/snapshot.mjs'
const [commit, bundlePath, runnerPath, evidencePath] = process.argv.slice(2)
const bundle = resolve(bundlePath), repository = resolve(runnerPath), output = resolve(evidencePath)
const manifest = await verify(bundle, commit)
const privateRoot = resolve(root, '.local-data/d27-b'), rel = relative(privateRoot, output)
assert.ok(rel && !isAbsolute(rel) && !rel.startsWith('..'))
await mkdir(output)
const bridgePath = manifest.repositoryLayout.bridgePath
assert.equal(bridgePath, 'services/api/agent-runner.mjs')
assert.equal(hash(await readFile(join(repository, bridgePath))), manifest.repositoryLayout.bridgeSha256)
// Verify the archive's Git binding; extraction must not silently borrow a development bridge.
assert.equal(command('git', ['rev-parse', `${commit}:${bridgePath}`]), manifest.repositoryLayout.bridgeGitBlob)
const source = join(output, 'source')
await mkdir(join(source, 'src/pages'), { recursive: true })
await writeFile(join(source, 'src/pages/HomePage.vue'), '<template><main><h1>D27 shipped bridge</h1></main></template>\n')
const sourceDigest = (await readSnapshot(source, { source: true })).manifest.digest
const roots = ['work', 'artifacts', 'browser', 'receipts'].map(name => join(output, name))
const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^(CODELESS_|VITE_|SPRING_|NODE_OPTIONS$|JAVA_TOOL_OPTIONS$|JDK_JAVA_OPTIONS$)/i.test(key)))
const result = spawnSync(process.execPath, [join(repository, bridgePath), ...roots], {
  cwd: repository, env, windowsHide: true, encoding: 'utf8', timeout: 180000,
  input: JSON.stringify({ sourceDirectory: source, sourceDigest,
    actions: [{ type: 'expectText', target: { role: 'heading', name: 'D27 shipped bridge' }, value: 'D27 shipped bridge' }] }),
})
await writeFile(join(output, 'bridge.stdout.json'), result.stdout ?? '')
await writeFile(join(output, 'bridge.stderr.log'), result.stderr ?? '')
const report = { task: 'D27-B', commit, repositoryRoot: relative(root, repository).replaceAll('\\', '/'),
  bridgePath, bridgeSha256: manifest.repositoryLayout.bridgeSha256, exitCode: result.status, signal: result.signal,
  status: 'FAILED', modelRequests: 0, publicAcceptance: false }
try {
  assert.equal(result.error, undefined); assert.equal(result.status, 0); assert.equal(result.signal, null)
  const response = JSON.parse(result.stdout)
  assert.equal(response.status, 'VERIFIED'); assert.equal(response.sourceDigest, sourceDigest)
  assert.equal(response.build.status, 'SUCCEEDED'); assert.equal(response.build.exitCode, 0)
  assert.equal(response.verification.status, 'PASSED'); assert.equal(response.verification.cleanup.browserClosed, true)
  const receipt = await readFile(join(roots[3], response.executionId + '.json'))
  assert.deepEqual(JSON.parse(receipt), response)
  report.status = 'PASSED'; report.buildImageId = response.build.imageId
  report.sourceDigest = sourceDigest; report.artifactDigest = response.build.artifact.digest
  report.receiptSha256 = hash(receipt); report.browserClosed = true
} catch (error) { report.error = error.code ?? error.name; process.exitCode = 1 }
await writeFile(join(output, 'bridge.json'), JSON.stringify(report, null, 2) + '\n')
console.log(JSON.stringify(report))
