import { isIP } from 'node:net'

export function publicFile(name) {
  return name === 'index.html' || /^assets\/[A-Za-z0-9_-]+\.(?:js|css|svg|png|jpg|jpeg|webp|ico|woff|woff2)$/.test(name)
}
// Fail closed for private, reserved, transition and mapped addresses. IPv4 only in v0.
export function publicAddress(address) {
  if (isIP(address) !== 4) return false
  const [a, b] = address.split('.').map(Number)
  return !(a === 0 || a === 10 || a === 127 || a >= 224 || a === 169 && b === 254 ||
    a === 172 && b >= 16 && b <= 31 || a === 192 && [0, 168].includes(b) ||
    a === 100 && b >= 64 && b <= 127 || a === 198 && [18, 19, 51].includes(b) ||
    a === 203 && b === 0)
}
