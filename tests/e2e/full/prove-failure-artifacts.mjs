// Negative acceptance: the injected test MUST fail. Never used by the merge gate.
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { readdir, readFile, writeFile, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { root, run } from './support.mjs'

const runs = join(root, '.local-data/d20-b/runs'), before = new Set(await readdir(runs).catch(() => []))
const child = spawn(process.execPath, ['tests/e2e/full/record-command.mjs', 'full'], {
  cwd: root, env: { ...process.env, CODELESS_FULL_INJECT_ASSERTION: '1' }, windowsHide: true, stdio: 'inherit' })
const [exitCode, signal] = await once(child, 'close')
assert.equal(exitCode, 1, 'Injected browser assertion must fail natively; do not retry')
assert.equal(signal, null)
const created = (await readdir(runs)).filter(name => !before.has(name))
assert.equal(created.length, 1)
const directory = join(runs, created[0]), report = JSON.parse(await readFile(join(directory, 'run.json'), 'utf8'))
const identities = JSON.parse(await readFile(join(directory, 'identities.json'), 'utf8'))
assert.equal(report.status, 'FAILED'); assert.equal(report.browserExitCode, 1); assert.equal(report.retries, 0)
assert.match(identities.failure, /D20 failure-artifact canary/)
assert.ok(identities.actors[0].generation && identities.actors[0].original)
assert.match(report.revision, /^[a-f0-9]{40}$/); assert.ok(Object.keys(report.sources).length > 0)
assert.equal(report.databaseRemoved, true); assert.equal(report.hostingRemoved, true); assert.deepEqual(report.cleanupErrors, [])
const files = await readdir(directory, { recursive: true })
const screenshots = files.filter(name => /failure-.*\.png$|test-failed-.*\.png$/.test(name))
const traces = files.filter(name => /(?:^|[\\/])trace\.zip$/.test(name))
assert.ok(screenshots.length > 0); assert.ok(traces.length > 0)
for (const path of screenshots) assert.equal((await readFile(join(directory, path))).subarray(0, 8).toString('hex'), '89504e470d0a1a0a')
// Standard-library ZIP CRC/content validation, independent of the Playwright writer.
for (const path of traces) run(process.platform === 'win32' ? 'python' : 'python3', ['-c',
  'import sys,zipfile; z=zipfile.ZipFile(sys.argv[1]); assert z.testzip() is None; assert any(n.endswith(".trace") for n in z.namelist()); assert any(n.startswith("resources/") for n in z.namelist())',
  join(directory, path)])
const artifacts = []
for (const path of [...screenshots, ...traces, 'run.json', 'identities.json', 'playwright.json']) artifacts.push({ path, bytes: (await stat(join(directory, path))).size })
const proof = { task: 'D20-B-T4', status: 'PASSED', negativeRunStatus: report.status, negativeNativeExitCode: exitCode,
  revision: report.revision, canonical: report.canonical, taskId: identities.actors[0].generation,
  versionId: identities.actors[0].original, sourceDigests: report.sources, directory, artifacts,
  assertion: 'D20 failure-artifact canary', testRetries: 0, archiveIntegrityChecked: true, resourceCleanupConfirmed: true }
const destination = join(root, '.local-data/d20-b/failure-proof-' + new Date().toISOString().replaceAll(':', '-') + '.json')
await writeFile(destination, JSON.stringify(proof, null, 2) + '\n')
console.log(JSON.stringify({ proof: destination, status: proof.status, negativeNativeExitCode: exitCode, artifacts: artifacts.length }))
