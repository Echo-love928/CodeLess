import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import { validateInterference } from './api-evidence.mjs'
import { waitForCPULoop } from './support.mjs'

test('CPU barrier waits for the actual child after Running and retains earlier process snapshots', async () => {
  let clock = 0
  const observations = [], tops = ['PID PPID COMMAND\n1 0 node /opt/codeless/pressure-entry.mjs',
    'PID PPID COMMAND\n1 0 node /opt/codeless/pressure-entry.mjs\n14 1 node -e while(true) {}']
  const top = await waitForCPULoop(async () => tops.shift(), { observations, now: () => clock, pause: async ms => { clock += ms } })
  assert.equal(observations.length, 2)
  assert.doesNotMatch(observations[0].top, /node\s+-e/)
  assert.match(top, /node\s+-e\s+while\(true\)/)
})

test('a Running container without the CPU child cannot pass the startup deadline', async () => {
  let clock = 0
  const observations = []
  await assert.rejects(waitForCPULoop(async () => '1 0 node /opt/codeless/pressure-entry.mjs',
    { timeoutMs: 100, observations, now: () => clock, pause: async ms => { clock += ms } }), /CPU-loop startup deadline/)
  assert.equal(observations.length, 2)
})

test('CPU process inspection errors fail immediately instead of being retried to success', async () => {
  let queries = 0
  const error = new Error('docker inspection failed')
  await assert.rejects(waitForCPULoop(async () => { queries++; throw error }), e => e === error)
  assert.equal(queries, 1)
})
const base = new URL('./evidence/', import.meta.url)
const manifest = JSON.parse(await readFile(new URL('manifest.json', base)))
const reports = await Promise.all(manifest.reports.filter(r => r.file.startsWith('api-')).map(async r => JSON.parse(await readFile(new URL(r.file, base)))))
const corrected = reports.filter(r => r.faults?.some(f => f.mode === 'memory-control'))
test('D22 T2: corrected HTTP samples follow independent OOM/CPU barriers and cleanup', () => {
  assert.ok(corrected.length >= 1)
  for (const report of corrected) assert.equal(validateInterference(report).qualifiedOOM, 10)
})
test('D22 T2: Running-only records and pre-OOM GETs cannot qualify', () => {
  const legacy = reports.find(r => r.status === 'PASSED' && !r.faults.some(f => f.mode === 'memory-control'))
  assert.ok(legacy); assert.throws(() => validateInterference(legacy), /independent OOM barrier/)
  const corrupted = structuredClone(corrected[0])
  const barrier = corrupted.faults.find(f => f.mode === 'memory').observed.value.barrier.monotonicMs
  corrupted.samples.find(s => s.phase === 'memory-after-oom-confirmation').monotonicStartMs = barrier - 1
  assert.throws(() => validateInterference(corrupted), /GET must follow actual OOM/)
})
