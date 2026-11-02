// Verify exact published/index bytes. This checks report references, not M5.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
const staged = process.argv[2] === '--staged'
const prefix = 'tests/release/browser/evidence/d28/'
const read = path => {
  assert.ok(path.startsWith(prefix) && !path.split('/').includes('..'))
  const result = spawnSync('git', ['show', (staged ? ':' : 'HEAD:') + path], { windowsHide: true, maxBuffer: 8 * 1024 * 1024 })
  assert.equal(result.status, 0, path)
  return result.stdout
}
const json = path => JSON.parse(read(prefix + path).toString('utf8'))
const hash = bytes => createHash('sha256').update(bytes).digest('hex')
let checked = 0
const verify = (path, expected) => { assert.match(expected, /^[a-f0-9]{64}$/); assert.equal(hash(read(path)), expected, path); checked++ }
for (const entry of Object.values(json('summary.json').evidence)) verify(entry.path, entry.sha256)
for (const entry of json('runtime-usage.json').runs) {
  assert.match(entry.receipt, /^flow-[a-z-]+\.json$/)
  verify(prefix + entry.receipt, entry.sha256)
}
const api = json('api-configured.json').originalReceipt
verify(api.path, api.sha256)
verify(prefix + 'public-trace.zip', json('public-trace-scan.json').traceSha256)
verify(prefix + 'public-initial-trace.zip', json('public-initial-trace-scan.json').traceSha256)
console.log(JSON.stringify({ status: 'PASSED_PUBLIC_REFERENCE_BYTES', ref: staged ? 'INDEX' : 'HEAD', checked, M5Accepted: false }))
