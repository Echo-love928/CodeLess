// Read-only counterexample against the pinned D25-B validator in a private archive.
// Usage: node tests/eval/d25-a-peer-repro.mjs <archive-root> <output.json>
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { pathToFileURL } from 'node:url'
const [directory, output] = process.argv.slice(2)
const { validate } = await import(pathToFileURL(resolve(directory, 'evals/edit-results/validate.mjs')).href)
const original = JSON.parse(readFileSync(join(directory, 'evals/edit-results/D25-B/index.json'), 'utf8'))
const mixed = structuredClone(original)
// These are explicit synthetic markers, never real task evidence or a replacement result.
for (const row of mixed.rows.filter(row => row.id.startsWith('EDIT-'))) Object.assign(row, {
  mode: 'MOCK', status: 'PASSED', passed: true, taskId: 'SYNTHETIC-MOCK-TASK',
  beforeVersionId: 'SYNTHETIC-BEFORE', versionId: 'SYNTHETIC-AFTER', screenshot: 'fixture.png',
  evidence: 'fixture.json', evidenceDigest: 'sha256:' + '0'.repeat(64), address: 'http://127.0.0.1',
  diff: 'fixture-diff.json', scopePreserved: true, historyPreserved: true,
})
let rejected = false, observed = null
try { observed = validate(mixed) } catch { rejected = true }
const result = { task: 'D25-A', reviewedCommit: 'bd6188ffef5cb1d2ab5d05a14d94f5e8e71a58ac',
  original: validate(original), scenario: 'REAL index containing six explicit MOCK success rows',
  expected: 'reject mixed modes', rejected, observed, reproduced: !rejected && observed?.acceptance === true,
  limitation: 'Synthetic read-only validator counterexample; does not change B evidence or claim a real editing result.' }
writeFileSync(output, JSON.stringify(result, null, 2) + '\n', { flag: 'wx' })
console.log(JSON.stringify(result))
process.exitCode = rejected ? 0 : 1
