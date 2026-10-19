// Copies the latest PASSED acceptance run's public reports into tests/export/evidence/<date>/ and writes commands.json
// with every recorded run (failures and history included), native exit codes, log digests and JUnit counts.
// Raw logs stay private under .local-data/d16-a/runs/. Usage: node tests/export/export-evidence.mjs 2026-10-19
import { readdirSync, readFileSync, existsSync, mkdirSync, copyFileSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const repo = fileURLToPath(new URL('../../', import.meta.url))
const [date] = process.argv.slice(2)
if (!/^\d{4}-\d{2}-\d{2}$/.test(date ?? '')) throw new Error('Usage: export-evidence.mjs YYYY-MM-DD')
const runsRoot = join(repo, '.local-data/d16-a/runs'), target = join(repo, 'tests/export/evidence', date)
const sha = bytes => 'sha256:' + createHash('sha256').update(bytes).digest('hex')
function junit(dir) {
  if (!existsSync(dir)) return null
  const suites = readdirSync(dir).filter(n => /^TEST-.*\.xml$/.test(n)).sort().map(n => {
    const tag = readFileSync(join(dir, n), 'utf8').match(/<testsuite\b[^>]*>/)?.[0] ?? ''
    const attr = k => Number(tag.match(new RegExp(`\\b${k}="(\\d+)"`))?.[1] ?? NaN)
    return { suite: tag.match(/\bname="([^"]+)"/)?.[1] ?? n, tests: attr('tests'), failures: attr('failures'), errors: attr('errors'), skipped: attr('skipped') }
  })
  const total = k => suites.reduce((s, x) => s + x[k], 0)
  return { suites, tests: total('tests'), failures: total('failures'), errors: total('errors'), skipped: total('skipped') }
}
const runs = readdirSync(runsRoot).sort().filter(n => existsSync(join(runsRoot, n, 'run.json'))).map(name => {
  const run = JSON.parse(readFileSync(join(runsRoot, name, 'run.json'), 'utf8'))
  return { run: name, mode: run.mode, head: run.head, startedAt: run.startedAt, completedAt: run.completedAt ?? null,
    status: run.status, exitCode: run.exitCode, signal: run.signal, completionVerified: run.completionVerified ?? null,
    command: run.command, logDigest: run.logDigest ?? null, modelProvider: run.modelProvider,
    uncommittedScopedFiles: run.uncommittedScopedFiles, junit: junit(join(runsRoot, name, 'junit')) }
})
const canonical = runs.filter(r => r.mode === 'acceptance' && r.status === 'PASSED').at(-1)
if (!canonical) throw new Error('No PASSED acceptance run to export')
mkdirSync(target, { recursive: true })
const source = join(runsRoot, canonical.run, 'export'), copied = []
for (const name of readdirSync(source).filter(n => /\.(json|zip|log)$/.test(n)).sort()) {
  copyFileSync(join(source, name), join(target, name))
  copied.push({ file: name, digest: sha(readFileSync(join(target, name))) })
}
writeFileSync(join(target, 'commands.json'), JSON.stringify({ card: 'D16-A', canonicalAcceptanceRun: canonical.run,
  note: 'Every recorded run is listed, including failures; raw logs are private under .local-data/d16-a/runs/<run>/command.log.',
  copied, runs }, null, 2) + '\n')
console.log(JSON.stringify({ exported: relative(repo, target), canonical: canonical.run, files: copied.length, runs: runs.length }))
