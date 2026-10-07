import { createBuildVerifier } from '../runner/src/verify/workflow.mjs'
import { readSnapshot } from '../runner/src/artifacts/snapshot.mjs'
import { validateActions } from '../runner/src/verify/actions.mjs'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { randomUUID } from 'node:crypto'

// Fixed trusted bridge. Roots are process configuration; model text cannot set them.
const [workRoot, artifactRoot, evidenceRoot, receiptRoot] = process.argv.slice(2)
if (!workRoot || !artifactRoot || !evidenceRoot || !receiptRoot || process.argv.length !== 6) process.exit(2)
let input = ''
for await (const bytes of process.stdin) {
  input += bytes.toString('utf8')
  if (Buffer.byteLength(input) > 128 * 1024) process.exit(2)
}
const job = JSON.parse(input)
if (Object.keys(job).sort().join(',') !== 'actions,sourceDigest,sourceDirectory') process.exit(2)
const source = await readSnapshot(job.sourceDirectory, { source: true, files: 40, bytes: 524288, fileBytes: 131072 })
if (source.manifest.digest !== job.sourceDigest) process.exit(2)
const actions = validateActions(job.actions)
let result
try {
  const run = await createBuildVerifier({ workRoot, artifactRoot, evidenceRoot })
  result = await run(job.sourceDirectory, actions)
} catch {
  result = { status: 'FAILED', sourceDigest: source.manifest.digest, build: null, verification: null, failure: 'RUNNER_UNAVAILABLE' }
}
result.executionId = randomUUID()
await mkdir(resolve(receiptRoot), { recursive: true })
await writeFile(join(resolve(receiptRoot), result.executionId + '.json'), JSON.stringify(result), { flag: 'wx' })
process.stdout.write(JSON.stringify(result))
process.exitCode = result.status === 'VERIFIED' ? 0 : 1
