// Developer filesystem diagnostic only; never a substitute for publish admission.
import assert from 'node:assert/strict'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve, join, relative } from 'node:path'
import { randomUUID, createHash } from 'node:crypto'
import { createPublicationStore } from '../../../services/runner/src/publish/store.mjs'

if (process.argv.length !== 2) throw new Error('This diagnostic accepts no arguments')
const sha = bytes => 'sha256:' + createHash('sha256').update(bytes).digest('hex')
const output = resolve('.local-data/d24-b/store-probe', randomUUID())
const root = join(output, 'sites')
await mkdir(root, { recursive: true })
const report = { task: 'D24-B', purpose: 'One isolated synthetic publication-store write; not the failed hosting scenario or proof of authorized publication',
  command: 'node tests/regression/experience/publication-store-probe.mjs', startedAt: new Date().toISOString(), retries: 0, paidRequests: 0,
  storeDigest: sha(await readFile(new URL('../../../services/runner/src/publish/store.mjs', import.meta.url))),
  diagnosticDigest: sha(await readFile(new URL(import.meta.url))), status: 'RUNNING', exitCode: null }
try {
  const store = await createPublicationStore(root)
  const buffers = new Map([['index.html', Buffer.from('<h1>Explicit synthetic filesystem probe</h1><script src="assets/app.js"></script>')],
    ['assets/app.js', Buffer.from('console.log("synthetic filesystem probe")')]])
  const receipt = { deploymentId: randomUUID(), files: [...buffers].map(([path, bytes]) => ({ path, digest: sha(bytes) })) }
  await store(receipt, buffers)
  for (const [path, bytes] of buffers) assert.deepEqual(await readFile(join(root, receipt.deploymentId, path)), bytes)
  assert.deepEqual(JSON.parse(await readFile(join(root, receipt.deploymentId, '__deployment.json'), 'utf8')), receipt)
  report.status = 'PASSED'; report.exitCode = 0
} catch (error) {
  report.status = 'FAILED'; report.exitCode = 1
  report.failure = { name: error.name, code: error.code ?? null, syscall: error.syscall ?? null }
  process.exitCode = 1
}
report.completedAt = new Date().toISOString()
report.attribution = 'UNATTRIBUTED; this isolated result cannot explain or erase the original hosting EPERM'
await writeFile(join(output, 'run.json'), JSON.stringify(report, null, 2) + '\n')
console.log(JSON.stringify({ output: relative(process.cwd(), output), status: report.status, exitCode: report.exitCode }))
