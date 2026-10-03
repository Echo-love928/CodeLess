import { randomBytes } from 'node:crypto'
import { createServer } from 'node:http'
import { dirname, join, resolve } from 'node:path'
import { lstat, realpath } from 'node:fs/promises'
import { readSnapshot, isDigest } from './snapshot.mjs'
import { artifactFile } from './routes.mjs'

const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
  '.ico': 'image/x-icon', '.woff': 'font/woff', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8' }
export const CSP = "default-src 'self' data:; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; " +
  "connect-src 'self'; worker-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; " +
  "form-action 'none'; frame-ancestors 'none'"
const handles = new WeakMap()

// Trusted worker API only. No endpoint accepts a serialized build or a filesystem path.
export async function openArtifactService({ artifactRoot, build, sourceDigest }) {
  if (!build || build.status !== 'SUCCEEDED' || build.exitCode !== 0 || build.failure !== null ||
      build.timedOut !== false || build.oomKilled !== false || !build.completedAt ||
      !Number.isFinite(Date.parse(build.completedAt)) || !isDigest(sourceDigest) ||
      !build.cleanup?.containerRemoved || !build.cleanup?.workspaceRemoved ||
      build.cleanup?.errors?.length !== 0 || !build.artifact || !isDigest(build.artifact.digest) ||
      !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(build.id ?? '')) throw new Error('only confirmed completed builds may be served')
  const rootStat = await lstat(artifactRoot)
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) throw new Error('artifact root must be a real directory')
  const root = await realpath(artifactRoot)
  const directory = resolve(build.artifact.directory)
  if (directory !== join(root, build.id) || dirname(directory) !== root) throw new Error('artifact outside worker root')
  const { buffers, manifest } = await readSnapshot(directory)
  if (!buffers.has('index.html') || !manifest.files.some((file) => file.path.endsWith('.js')) ||
      manifest.digest !== build.artifact.digest || manifest.bytes !== build.artifact.bytes ||
      JSON.stringify(manifest.files) !== JSON.stringify(build.artifact.files)) throw new Error('artifact hash mismatch')

  const token = randomBytes(32).toString('hex')
  let origin
  const server = createServer((request, response) => {
    const deny = (code) => { response.writeHead(code, { 'Cache-Control': 'no-store' }); response.end() }
    if (request.headers.host !== new URL(origin).host || request.headers['x-codeless-artifact-token'] !== token ||
        !['GET', 'HEAD'].includes(request.method)) return deny(403)
    if (/%|\\/.test(request.url) || /(?:^|\/)\.\.(?:\/|$)/.test(request.url)) return deny(403)
    let url
    try { url = new URL(request.url, origin) } catch { return deny(400) }
    if (url.origin !== origin || url.username || url.password || /%|\\/.test(url.pathname)) return deny(403)
    const destination = request.headers['sec-fetch-dest']
    const name = artifactFile(url.pathname, destination === undefined || destination === 'document')
    const bytes = name === null ? undefined : buffers.get(name)
    if (!bytes) return deny(404) // Never map an arbitrary path or unknown route onto index.html.
    const extension = name.slice(name.lastIndexOf('.'))
    response.writeHead(200, { 'Content-Type': mime[extension] ?? 'application/octet-stream',
      'Content-Length': bytes.length, 'Content-Security-Policy': CSP,
      'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer',
      'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), usb=()',
      'Cache-Control': 'no-store', 'Cross-Origin-Resource-Policy': 'same-origin' })
    response.end(request.method === 'HEAD' ? undefined : bytes)
  })
  // This server doubles as a non-forwarding HTTP proxy. CONNECT and every other origin fail closed.
  server.on('connect', (_request, socket) => { socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n') })
  server.on('upgrade', (_request, socket) => { socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n') })
  server.on('clientError', (_error, socket) => socket.destroy())
  server.requestTimeout = 3000
  server.headersTimeout = 3000
  server.maxConnections = 64
  await new Promise((done, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', done)
  })
  origin = 'http://127.0.0.1:' + server.address().port
  const handle = Object.freeze({ buildId: build.id, sourceDigest, artifactDigest: manifest.digest, origin,
    close: () => new Promise((done, reject) => {
      handles.delete(handle)
      server.close((error) => error ? reject(error) : done())
      server.closeAllConnections()
    }) })
  handles.set(handle, { token, paths: [...buffers.keys()] })
  return handle
}

export function browserTarget(handle) {
  const target = handles.get(handle)
  if (!target) throw new Error('browser requires a live worker-owned artifact handle')
  return { ...target, origin: handle.origin }
}
