import { readFileSync, writeFileSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import assert from 'node:assert/strict'

const root = resolve(import.meta.dirname, '../../..')
const hash = p => 'sha256:' + createHash('sha256').update(readFileSync(join(root, p))).digest('hex')
const git = (...args) => {
  const r = spawnSync('git', ['-c', `safe.directory=${root.replaceAll('\\', '/')}`, ...args], { cwd: root, encoding: 'utf8' })
  if (r.status !== 0) throw Error(r.stderr)
  return r.stdout.trim()
}
const target = join(import.meta.dirname, 'release-freeze.json')
const frozenPaths = () => git('ls-files', '--cached', '--others', '--exclude-standard', '--', 'contracts/openapi.v0.json', 'contracts/schemas/v0', 'prompts/runtime', 'services/api/src/main', 'services/api/pom.xml').split(/\r?\n/).filter(Boolean)
if (process.argv[2] === 'capture') {
  const paths = frozenPaths()
  const batch = 'evals/results/generation/runs/2026-10-30T08-15-32Z-real-29ffed9b/samples'
  const failures = ['TASK-02', 'CAT-01', 'TASK-03', 'FAULT-CODE-02', 'FAULT-CODE-03', 'FAULT-ENV-01', 'FAULT-ENV-02'].map(sampleId => {
    const record = `${batch}/${sampleId}/record.json`
    let data
    try { data = JSON.parse(readFileSync(join(root, record), 'utf8')) } catch (e) {
      if (e.code !== 'ENOENT') throw e
      // ENV-02 was refused before a sample JVM; preserve its actual invocation record, not an invented task.
      const invocation = `${batch}/${sampleId}/invocation-result.json`
      const value = JSON.parse(readFileSync(join(root, invocation), 'utf8'))
      return { sampleId, originalTaskId: null, source: invocation, digest: hash(invocation), originalStatus: 'NOT_STARTED', originalFailure: value.launchError ?? null }
    }
    assert.equal(data.mode, 'REAL')
    return { sampleId, originalTaskId: data.task.id, source: record, digest: hash(record), originalStatus: data.task.status,
      originalFailure: data.task.failureCode, disposition: sampleId === 'TASK-03' ? 'PR84_PROMPT_FIX_REAL_NOT_EVALUATED' : 'RETAIN_FAILURE_NO_RETRY' }
  })
  writeFileSync(target, JSON.stringify({ task: 'D26-A', baseline: git('rev-parse', 'HEAD'), createdAt: new Date().toISOString(),
    apiChanges: [], runtimePromptChanges: [], sharedContractChanges: [],
    backendChanges: [{ file: 'services/api/src/main/java/dev/codeless/api/cover/CoverCoordinator.java', issue: 'D26-A-COVER-01', behavior: 'Unconfirmed entry quarantines without advancing the cursor; no automatic capture retry' }],
    externalDependency: { pr: 'https://github.com/Echo-love928/CodeLess/pull/84', commit: '380811d5270a72706fad0b1a74b7ffab8b97735a',
      integrated: ['agent-generate-v1.txt', 'plan-v1.txt'].every(p => git('rev-parse', `HEAD:prompts/runtime/${p}`) === git('rev-parse', `380811d:prompts/runtime/${p}`)), realModelEvaluation: 'NOT_EVALUATED' },
    files: Object.fromEntries(paths.map(p => [p, hash(p)])), failures }, null, 2) + '\n', { flag: 'wx' })
} else if (process.argv[2] === 'check') {
  const frozen = JSON.parse(readFileSync(target, 'utf8'))
  assert.deepEqual(frozenPaths().sort(), Object.keys(frozen.files).sort(), 'API/runtime file set changed; review freeze and affected evaluation')
  for (const [p, digest] of Object.entries(frozen.files)) assert.equal(hash(p), digest, `frozen API/runtime changed: ${p}; review change list and rerun affected evaluation`)
  for (const f of frozen.failures) assert.equal(hash(f.source), f.digest, `original failure changed: ${f.sampleId}`)
  console.log(JSON.stringify({ task: frozen.task, status: 'PASSED', frozenFiles: Object.keys(frozen.files).length, originalFailures: frozen.failures.length,
    apiChanges: frozen.apiChanges, runtimePromptChanges: frozen.runtimePromptChanges, realModelEvaluation: 'NOT_EVALUATED' }))
} else throw Error('Expected capture or check')
