import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { frozenByteIdentity, digest } from './freeze-bytes.mjs'
const reviewed = JSON.parse(readFileSync(new URL('./freeze-reviewed-eol.json', import.meta.url)))
const identities = JSON.parse(readFileSync(new URL('./freeze-source-identities.json', import.meta.url)))
test('four retained mixed-EOL originals and both exact Git checkout forms preserve content identity', () => {
  for (const f of reviewed.files) {
    const original = readFileSync(new URL(f.proofRawBytesFile, import.meta.url))
    assert.equal(digest(original), f.originalRawDigest)
    assert.equal(frozenByteIdentity(original, f.originalRawDigest, identities.files[f.path]).kind, 'EXACT_RAW')
    const lf = Buffer.from(original.toString('utf8').replaceAll('\r\n', '\n'))
    for (const bytes of [lf, Buffer.from(lf.toString('utf8').replaceAll('\n', '\r\n'))]) {
      const r = frozenByteIdentity(bytes, f.originalRawDigest, identities.files[f.path])
      assert.equal(r.matched, true, f.path)
      assert.equal(r.kind, 'REVIEWED_CHECKOUT_EOL')
    }
  }
})
test('a content change, BOM, whitespace or missing bound identity cannot be called an EOL-only change', () => {
  for (const f of reviewed.files) {
    const original = readFileSync(new URL(f.proofRawBytesFile, import.meta.url))
    const lf = Buffer.from(original.toString('utf8').replaceAll('\r\n', '\n'))
    for (const bytes of [Buffer.concat([lf, Buffer.from(' ')]), Buffer.concat([Buffer.from('\ufeff'), lf]), Buffer.from(lf.toString().replace(/a/i, 'Z'))])
      assert.equal(frozenByteIdentity(bytes, f.originalRawDigest, identities.files[f.path]).matched, false, f.path)
    assert.equal(frozenByteIdentity(lf, f.originalRawDigest, undefined).matched, false)
    assert.equal(frozenByteIdentity(lf, 'sha256:' + '0'.repeat(64), identities.files[f.path]).matched, false)
  }
})
test('runtime prompt EOL differences and unknown bytes remain rejected', () => {
  const raw = Buffer.from('System policy\n'), expected = digest(raw)
  const identity = { originalRawDigest: expected, strictRuntimeBytes: true, reviewedCheckoutDigests: [digest(Buffer.from('System policy\r\n'))] }
  assert.equal(frozenByteIdentity(raw, expected, identity).matched, true)
  assert.equal(frozenByteIdentity(Buffer.from('System policy\r\n'), expected, identity).matched, false)
})
