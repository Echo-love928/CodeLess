import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { test } from 'node:test'
import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'

test('B resource sidecar preserves PID identity, unknown metrics and credential boundaries', () => {
  const result = spawnSync(process.platform === 'win32' ? 'python' : 'python3',
    ['tests/performance/runner/resource-monitor.test.py'], { encoding: 'utf8', windowsHide: true, timeout: 15_000 })
  assert.equal(result.error, undefined, result.error?.message)
  assert.equal(result.status, 0, result.stdout + result.stderr)
})

test('B Linux evidence retains the failed sampler and proves actual OOM before acknowledgement and removal', async () => {
  const base = new URL('./evidence/resource-support-2026-10-28/', import.meta.url)
  const read = async name => JSON.parse(await readFile(new URL(name, base)))
  const manifest = await read('manifest.json')
  for (const [name, digest] of Object.entries({ ...manifest.files, ...manifest.derivedFiles })) {
    assert.match(name, /^[A-Za-z0-9./-]+$/)
    assert.ok(!name.includes('..'))
    assert.equal(createHash('sha256').update(await readFile(new URL(name, base))).digest('hex'), digest, name)
  }
  assert.equal((await read('attempt-01-failed/smoke.json')).status, 'FAILED')
  assert.equal((await read('attempt-01-failed/resources/summary.json')).status, 'INCOMPLETE')
  const result = await read('attempt-03-final/smoke.json')
  const summary = await read('attempt-03-final/resources/summary.json')
  const rows = (await readFile(new URL('attempt-03-final/resources/samples.jsonl', base), 'utf8'))
    .trim().split('\n').map(line => JSON.parse(line))
  assert.equal(result.status, 'PASSED')
  assert.equal(result.collectorExitCode, 0)
  assert.equal(result.containerExitCode, 137)
  assert.deepEqual(result.cleanupErrors, [])
  assert.equal(summary.samplerSha256, result.samplerSha256)
  assert.equal(summary.status, 'COMPLETE')
  assert.equal(summary.workloadResult, 'NOT_EVALUATED')
  assert.equal(summary.modelRequests, 'NOT_MEASURED')
  assert.equal(rows.length, result.sampleCount)
  assert.ok(rows.every(row => row.monotonicNs <= row.completedMonotonicNs && row.errors.length === 0))
  const cpu = rows.map(row => row.processes['process-1'].cpuTicks)
  assert.equal(Math.max(...cpu) - Math.min(...cpu), result.cpuTicksObserved)
  assert.ok(result.cpuTicksObserved > 50)
  const oom = rows.find(row => row.containers.some(c => c.oomKilled &&
    c.process?.cgroup?.metrics?.['memory.events']?.oom_kill > 0))
  assert.ok(oom.completedMonotonicNs < result.guardianAcknowledgedMonotonicNs)
  assert.ok(oom.containers.some(c => c.limits.memoryBytes === 96 * 1024 * 1024 && c.limits.pids === 128))
  assert.ok(rows.some(row => row.containers.some(c => c.state === 'REMOVED') && row.scratch['scratch-1'].state === 'ABSENT'))
  assert.equal((await read('unit-final-command.json')).exitCode, 0)
  assert.equal((await read('final-check.json')).ownedContainersAbsent, true)
  assert.equal((await read('compatibility.json')).newPublicRunnerFieldsRequired, false)
})
