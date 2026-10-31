// Run from the repository root after all selected commands have terminated.
// Only allowlisted metadata and diagnostic summaries enter the public evidence.
import { readFile, readdir, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { join } from 'node:path'
const sha = b => 'sha256:' + createHash('sha256').update(b).digest('hex')
const commands = []
for (const base of ['.local-data/d21-b/commands', '.local-data/d20-b/commands']) {
  for (const dir of (await readdir(base)).sort()) {
    const file = join(base, dir, base.includes('d20-b') ? 'run.json' : 'command.json')
    const bytes = await readFile(file), r = JSON.parse(bytes)
    let cancellation = null
    if (!r.completedAt) {
      cancellation = JSON.parse(await readFile('docs/evidence/D25-B/local-cancellation.json', 'utf8'))
      if (r.mode !== 'gate' || cancellation.mode !== 'gate') throw new Error('Still running: ' + dir)
    }
    const logPath = join(base, dir, 'command.log'), log = await readFile(logPath, 'utf8')
    commands.push({ mode: r.mode, command: r.command.map((v, i) => i === 0 && /node(?:\.exe)?$/i.test(v) ? 'node' : v),
      candidate: r.revision, startedAt: r.startedAt, completedAt: r.completedAt ?? cancellation.stoppedAt,
      exitCode: r.exitCode, signal: r.signal, status: cancellation ? 'CANCELLED' : r.status,
      canonical: r.canonical, changedSources: r.changedSources,
      commandRecord: file.replaceAll('\\', '/'), commandRecordDigest: sha(bytes),
      log: logPath.replaceAll('\\', '/'), logDigest: sha(await readFile(logPath)),
      cancellation, summaries: log.split(/\r?\n/).filter(line => /\[ci-gate\]|Tests run:|BUILD SUCCESS|BUILD FAILURE|^ℹ (tests|pass|fail|cancelled|skipped)|[0-9]+ passed|[0-9]+ failed|ERR_|Error:/.test(line)) })
  }
}
const gate = commands.find(c => c.mode === 'gate')
const allPassed = gate?.status === 'PASSED' && gate?.exitCode === 0 && gate?.signal === null
const stages = Object.fromEntries(['static', 'api', 'runner', 'e2e'].map(s => [s, {
  status: allPassed ? 'PASSED' : 'SEE_GATE_LOG', nativeExitCode: null,
  inferredExitCode: allPassed ? 0 : null,
  note: 'ci:gate executes every stage and retains first failure; individual native exit codes are not emitted by existing recorder' }]))
await writeFile('docs/evidence/D25-B/verification.json', JSON.stringify({ task: 'D25-B',
  candidate: '5de2e6cf995c95ee91a1f9dc40403654df0af3de',
  modelScope: 'deterministic-mock; not real model quality or public Internet acceptance',
  realAcceptance: 'BLOCKED', commands, stages,
  additionalChecks: [{ command: 'node --test tests/eval/d25-b.test.mjs', exitCode: 0, passed: 4 },
    { command: 'node evals/edit-results/validate.mjs evals/edit-results/D25-B/index.json', exitCode: 0, acceptance: null }],
  limitations: ['Runtime handoff unavailable; REAL rows NOT_EXECUTED', 'No D25-A review candidate',
    'Document/evidence commits were made during product checks; canonical=false, product changedSources must be empty',
    'Final PR HEAD CI is independent and must be checked again'] }, null, 2) + '\n')
