import test from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { encryptPrivateBytes, decryptPrivateBytes, encryptedDigest } from '../../scripts/eval/private-handoff-crypto.mjs'
test('private database and binary bytes round-trip without exposing plaintext', () => {
  const key = randomBytes(32), plain = Buffer.concat([Buffer.from('private SQL and original versions 中文\n'), randomBytes(256)])
  const sealed = encryptPrivateBytes(plain, key)
  assert.deepEqual(decryptPrivateBytes(sealed, key), plain)
  assert.equal(sealed.includes(Buffer.from('private SQL')), false)
  assert.match(encryptedDigest(sealed), /^sha256:[a-f0-9]{64}$/)
})
test('repeated encryption uses separate nonces and requires the separately delivered key', () => {
  const key = randomBytes(32), plain = Buffer.from('same original private evidence')
  const a = encryptPrivateBytes(plain, key), b = encryptPrivateBytes(plain, key)
  assert.notDeepEqual(a, b)
  assert.throws(() => decryptPrivateBytes(a, randomBytes(32)), /authentication failed/)
})
test('ciphertext or authentication-tag tampering fails instead of extracting partial plaintext', () => {
  const key = randomBytes(32), sealed = encryptPrivateBytes(Buffer.from('private original export'), key)
  for (const index of [sealed.length - 1, Buffer.byteLength('CODELESS-PRIVATE-HANDOFF-V1\n') + 12]) {
    const broken = Buffer.from(sealed); broken[index] ^= 1
    assert.throws(() => decryptPrivateBytes(broken, key), /authentication failed/)
  }
})
test('truncated, unfamiliar envelopes and invalid key sizes are refused', () => {
  const key = randomBytes(32)
  for (const bytes of [Buffer.alloc(0), Buffer.from('untrusted input'), encryptPrivateBytes(Buffer.from('x'), key).subarray(0, 30)])
    assert.throws(() => decryptPrivateBytes(bytes, key))
  assert.throws(() => encryptPrivateBytes(Buffer.alloc(0), Buffer.alloc(16)), /32-byte/)
})
