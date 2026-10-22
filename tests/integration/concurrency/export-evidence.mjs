// Copies the canonical D20-A acceptance evidence (latest PASSED acceptance run on a clean committed tree) into
// tests/integration/concurrency/evidence/DATE/ and summarizes every recorded run, failures included.
// Usage: node tests/integration/concurrency/export-evidence.mjs YYYY-MM-DD
import { readdirSync, readFileSync, existsSync, mkdirSync, copyFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'

const repo = fileURLToPath(new URL('../../../', import.meta.url))
const [date] = process.argv.slice(2)
if (!/^\d{4}-\d{2}-\d{2}$/.test(date ?? '')) throw new Error('Usage: export-evidence.mjs YYYY-MM-DD')
const root = join(repo, '.local-data/d20-a/runs'), target = join(repo, 'tests/integration/concurrency/evidence', date)
const junit = dir => {
  if (!existsSync(dir)) return null
  const total = { suites: 0, tests: 0, failures: 0, errors: 0, skipped: 0 }
  for (const name of readdirSync(dir).filter(n => n.endsWith('.xml'))) {
    const head = readFileSync(join(dir, name), 'utf8').match(/<testsuite\b[^>]*>/)?.[0] ?? ''
    const num = key => Number(head.match(new RegExp(String.raw`\b${key}="(\d+)"`))?.[1] ?? 0)
    total.suites++; for (const key of ['tests', 'failures', 'errors', 'skipped']) total[key] += num(key)
  }
  return total
}
const runs = readdirSync(root).filter(name => existsSync(join(root, name, 'run.json'))).sort()
  .map(name => ({ name, meta: JSON.parse(readFileSync(join(root, name, 'run.json'), 'utf8')) }))
// Slow-volume (@slow) runs are stress evidence, never the canonical acceptance.
const canonical = runs.filter(r => r.meta.mode === 'acceptance' && !r.meta.slowFreezeMs && r.meta.status === 'PASSED'
  && r.meta.uncommittedScopedFiles.length === 0).at(-1)
if (!canonical) throw new Error('No PASSED acceptance run on a clean committed tree')
mkdirSync(target, { recursive: true })
const evidence = join(root, canonical.name, 'concurrency')
for (const name of readdirSync(evidence).filter(n => n.endsWith('.json'))) copyFileSync(join(evidence, name), join(target, name))
const summary = runs.map(({ name, meta }) => ({ run: name, mode: meta.mode, slowFreezeMs: meta.slowFreezeMs ?? 0, head: meta.head, status: meta.status, exitCode: meta.exitCode,
  signal: meta.signal, completionVerified: meta.completionVerified ?? null, startedAt: meta.startedAt, completedAt: meta.completedAt ?? null,
  uncommittedScopedFiles: meta.uncommittedScopedFiles, logDigest: meta.logDigest ?? null, modelProvider: meta.modelProvider,
  ...(meta.mode.startsWith('mutation') ? { mutations: meta.mutations, expectedFailures: meta.expectedFailures, failedTests: meta.failedTests,
    restoredDigests: meta.restoredDigests } : {}),
  junit: junit(join(root, name, 'junit')) }))
writeFileSync(join(target, 'commands.json'), JSON.stringify({ canonicalAcceptanceRun: canonical.name, canonicalHead: canonical.meta.head,
  note: 'Raw logs and JUnit XML stay private under .local-data/d20-a/runs/; digests identify them.', runs: summary }, null, 2) + '\n')
console.log(JSON.stringify({ canonical: canonical.name, head: canonical.meta.head, runs: summary.length }))
