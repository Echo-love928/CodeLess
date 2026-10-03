import { createHmac, timingSafeEqual } from 'node:crypto'

export const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/
const digest = /^sha256:[a-f0-9]{64}$/
export function signingKey(hex) {
  if (typeof hex !== 'string' || !/^[a-f0-9]{64}$/.test(hex)) throw new Error('32-byte preview signing key required')
  return Buffer.from(hex, 'hex')
}
export function readCredential(token, key, now = Date.now()) {
  if (typeof token !== 'string' || token.length > 1000 || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{43}$/.test(token)) throw new Error('credential rejected')
  const [body, signature] = token.split('.')
  const expected = createHmac('sha256', key).update(body).digest()
  const supplied = Buffer.from(signature, 'base64url')
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) throw new Error('credential rejected')
  const fields = Buffer.from(body, 'base64url').toString('utf8').split('.')
  const [format, app, version, build, source, artifact, issued, expires, nonce] = fields
  if (fields.length !== 9 || format !== 'v1' || ![app, version, build].every(value => uuid.test(value)) ||
      ![source, artifact].every(value => digest.test(value)) || !/^\d{10}$/.test(issued) || !/^\d{10}$/.test(expires) ||
      !/^[a-f0-9]{32}$/.test(nonce) || Number(expires) - Number(issued) !== 120 ||
      Number(issued) > Math.floor(now / 1000) || Number(expires) <= Math.floor(now / 1000)) throw new Error('credential rejected')
  return Object.freeze({ app, version, build, source, artifact, expires: Number(expires) })
}
export function previewOrigins(previewOrigin, platformOrigin) {
  const preview = new URL(previewOrigin), platform = new URL(platformOrigin)
  for (const origin of [preview, platform]) {
    if (origin.protocol !== 'https:' || origin.username || origin.password || origin.pathname !== '/' ||
        origin.search || origin.hash || !/^[a-z0-9.-]+$/.test(origin.hostname)) throw new Error('HTTPS origin required')
    const labels = origin.hostname.split('.')
    if (labels.length < 3 || !['test', 'com', 'net', 'org', 'dev', 'app'].includes(labels.at(-1))) throw new Error('dedicated supported site required')
  }
  if (preview.hostname.split('.').slice(-2).join('.') === platform.hostname.split('.').slice(-2).join('.')) throw new Error('separate preview site required')
  return { preview, platform }
}
export const versionHost = (version, preview) => 'v' + version.replaceAll('-', '') + '.' + preview.host
