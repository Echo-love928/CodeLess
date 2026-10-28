import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { test } from 'node:test'

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
