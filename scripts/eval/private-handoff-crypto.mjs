// Encryption primitives for a future private DB/version bundle. No network, account key or model invocation.
import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'node:crypto'
const MAGIC = Buffer.from('CODELESS-PRIVATE-HANDOFF-V1\n')
function secret(key) {
  if (!Buffer.isBuffer(key) || key.length !== 32) throw Error('Handoff needs a private 32-byte AES key')
}
export const encryptedDigest = bytes => 'sha256:' + createHash('sha256').update(bytes).digest('hex')
export function encryptPrivateBytes(plain, key) {
  secret(key); if (!Buffer.isBuffer(plain)) throw Error('Handoff plaintext must be bytes')
  const nonce = randomBytes(12), cipher = createCipheriv('aes-256-gcm', key, nonce)
  cipher.setAAD(MAGIC)
  const data = Buffer.concat([cipher.update(plain), cipher.final()])
  return Buffer.concat([MAGIC, nonce, cipher.getAuthTag(), data])
}
export function decryptPrivateBytes(sealed, key) {
  secret(key)
  if (!Buffer.isBuffer(sealed) || sealed.length < MAGIC.length + 28 || !sealed.subarray(0, MAGIC.length).equals(MAGIC))
    throw Error('Invalid private handoff envelope')
  const offset = MAGIC.length, decipher = createDecipheriv('aes-256-gcm', key, sealed.subarray(offset, offset + 12))
  decipher.setAAD(MAGIC); decipher.setAuthTag(sealed.subarray(offset + 12, offset + 28))
  try { return Buffer.concat([decipher.update(sealed.subarray(offset + 28)), decipher.final()]) }
  catch { throw Error('Private handoff authentication failed; do not extract') }
}
