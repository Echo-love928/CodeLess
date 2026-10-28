import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { test } from 'node:test'
import { validateInterference } from './api-evidence.mjs'

test('D22 T4: committed raw samples preserve manifest SHA256 after checkout', async () => {
  const base = new URL('./evidence/', import.meta.url)
  const manifest = JSON.parse(await readFile(new URL('manifest.json', base)))
  assert.ok(manifest.reports.length >= 7)
  for (const report of manifest.reports) {
    assert.match(report.file, /^[A-Za-z0-9.-]+\.json$/)
    const bytes = await readFile(new URL(report.file, base))
    assert.equal('sha256:' + createHash('sha256').update(bytes).digest('hex'), report.digest, report.file)
    const observed = JSON.parse(bytes)
    assert.equal(observed.status, report.status)
    assert.equal(observed.canonical, report.canonical)
  }
})

test('D22 A+B: convergence evidence preserves raw verdicts and the original UNKNOWN failure', async () => {
  const base = new URL('./evidence/deployment-convergence-2026-10-28/', import.meta.url)
  const manifest = JSON.parse(await readFile(new URL('manifest.json', base)))
  for (const [file, digest] of Object.entries(manifest.files)) {
    assert.match(file, /^[A-Za-z0-9.-]+$/)
    assert.equal(createHash('sha256').update(await readFile(new URL(file, base))).digest('hex'), digest, file)
  }
  const current = JSON.parse(await readFile(new URL('full-result.json', base)))
  const command = JSON.parse(await readFile(new URL('full-command.json', base)))
  const original = JSON.parse(await readFile(new URL('../ab-full-result.json', base)))
  assert.equal(original.status, 'FAILED')
  assert.equal(command.exitCode, 0)
  assert.equal(current.status, 'PASSED')
  assert.equal(current.browserExitCode, 0)
  assert.deepEqual(current.cleanupErrors, [])
  assert.equal(current.canonical, false)
  const records = JSON.parse(await readFile(new URL('full-observations.json', base))).deploymentObservations
  assert.equal(Object.keys(records).length, 2)
  for (const observations of Object.values(records)) {
    assert.equal(observations.at(-1).status, 'PUBLISHED')
    assert.equal(observations.at(-1).phase, 'SUCCEEDED')
  }
})

test('D22 deployment calibration: authorized anonymous samples retain timing, saturation and full-chain outcomes', async () => {
  const base = new URL('./evidence/deployment-calibration-2026-10-28/', import.meta.url)
  const manifest = JSON.parse(await readFile(new URL('manifest.json', base)))
  const bytes = await readFile(new URL(manifest.file, base))
  assert.equal(createHash('sha256').update(bytes).digest('hex'), manifest.sha256)
  assert.equal(manifest.publicReportAuthorizedByUser, true)
  assert.equal(manifest.publicRawArchive, false)
  const report = JSON.parse(bytes)
  assert.equal(report.sources.canonical, false)
  assert.equal(report.realModelThroughputVerified, false)
  assert.equal(report.paidModelRequests, 0)
  assert.equal(report.capacity.admitted, 32)
  assert.equal(report.capacity.rejected, 1)
  const samples = report.capacity.samples.queryMsAtQueueDepth32.toSorted((a, b) => a - b)
  assert.equal(samples.length, 100)
  assert.equal(samples[Math.ceil(samples.length * .95) - 1], report.capacity.queryP95MsAtFullQueue)
  assert.deepEqual(validateInterference(report.apiIsolation), { qualifiedOOM: 10, qualifiedCPU: 10, negativeControl: 10, total: 80 })
  assert.equal(report.fullProduct.nativeExitCode, 0)
  assert.equal(report.fullProduct.browserExitCode, 0)
  assert.equal(report.fullProduct.publishedRows, 2)
  assert.deepEqual(report.fullProduct.cleanupErrors, [])
  assert.deepEqual(report.fullProduct.changedSources, [])
  assert.equal(report.retainedFailures.length, 4)
})
