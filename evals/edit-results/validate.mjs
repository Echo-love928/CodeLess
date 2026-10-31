import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import { resolve } from 'node:path'
import { edits } from '../edit/cases.mjs'

// A blocked acceptance must never become a zero-valued or successful score.
export function validate(index) {
  assert.match(index.candidate, /^[a-f0-9]{40}$/)
  assert.equal(index.mode, 'REAL')
  assert.deepEqual(index.rows.map(r => r.id), [...edits.map(e => e.id), 'PUBLIC-PAGE', 'COVER', 'DOWNLOAD'])
  for (const row of index.rows) {
    assert.equal(row.candidate, index.candidate)
    assert.equal(row.mode, index.mode, 'row mode must match index mode')
    assert.ok(['NOT_EXECUTED', 'FAILED', 'PASSED'].includes(row.status))
    if (row.status === 'NOT_EXECUTED') {
      assert.equal(row.passed, null)
      assert.ok(row.reason)
    } else if (row.status === 'FAILED') {
      assert.equal(row.passed, false)
      assert.ok(row.reason)
    } else {
      assert.equal(row.passed, true)
      for (const key of ['taskId', 'versionId', 'screenshot', 'evidence', 'address']) assert.ok(row[key], key)
      assert.match(row.evidenceDigest, /^sha256:[a-f0-9]{64}$/)
      if (row.id.startsWith('EDIT-')) {
        assert.ok(row.beforeVersionId)
        assert.ok(row.diff)
        assert.equal(row.scopePreserved, true)
        assert.equal(row.historyPreserved, true)
      }
    }
  }
  const selected = index.rows.filter(r => r.id.startsWith('EDIT-'))
  const executed = selected.filter(r => r.status !== 'NOT_EXECUTED').length
  return { denominator: 6, executed, passed: selected.filter(r => r.passed === true).length,
    acceptance: executed === 6 ? selected.filter(r => r.passed === true).length >= 5 : null }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href)
  console.log(JSON.stringify(validate(JSON.parse(await readFile(process.argv[2], 'utf8'))), null, 2))
