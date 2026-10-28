import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import { validateInterference } from './api-evidence.mjs'
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
