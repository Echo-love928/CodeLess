import { createHmac, randomBytes } from 'node:crypto'
import { createServer } from 'node:https'
import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { readFile, mkdir } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
export const KEY_HEX = '11'.repeat(32) // Explicit test-only key; never a deployment credential.
export function signed(handle, app, version, time = Date.now()) {
  const issued = Math.floor(time / 1000)
  const payload = ['v1', app, version, handle.buildId, handle.sourceDigest, handle.artifactDigest, issued, issued + 120, randomBytes(16).toString('hex')].join('.')
  const body = Buffer.from(payload).toString('base64url')
  return body + '.' + createHmac('sha256', Buffer.from(KEY_HEX, 'hex')).update(body).digest('base64url')
}
export const passedFixture = handle => ({ status: 'PASSED', failure: null, workerExitCode: 0, timedOut: false,
  completedAt: new Date().toISOString(), cleanup: { browserClosed: true }, screenshot: { digest: 'fixture' },
  buildId: handle.buildId, sourceDigest: handle.sourceDigest, artifactDigest: handle.artifactDigest })
export async function tlsServer(directory, listener) {
  await mkdir(directory, { recursive: true })
  let openssl = 'openssl'
  if (process.platform === 'win32') {
    const git = execFileSync('where.exe', ['git'], { encoding: 'utf8', windowsHide: true }).trim().split(/\r?\n/)[0]
    openssl = resolve(dirname(git), '../usr/bin/openssl.exe')
    if (!existsSync(openssl)) throw new Error('Test TLS requires Git-bundled openssl')
  }
  const cert = join(directory, 'test-cert.pem'), key = join(directory, 'test-key.pem')
  execFileSync(openssl, ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', key, '-out', cert,
    '-days', '1', '-subj', '/CN=codeless-preview-test', '-addext', 'subjectAltName=DNS:*.preview.codeless-preview.test,DNS:platform.codeless.test'],
    { stdio: 'ignore', windowsHide: true, env: { ...process.env, MSYS_NO_PATHCONV: '1' } })
  const server = createServer({ cert: await readFile(cert), key: await readFile(key) }, listener)
  await new Promise((done, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', done) })
  return server
}
export const closeServer = server => new Promise((done, reject) => {
  server.close(error => error ? reject(error) : done()); server.closeAllConnections()
})
