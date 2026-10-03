import { createServer } from 'node:http'
import { browserTarget } from '../artifacts/service.mjs'
import { artifactFile } from '../artifacts/routes.mjs'
import { readCredential, signingKey, previewOrigins, versionHost, uuid } from './credentials.mjs'

// Trusted coordinator API only: mappings cannot be registered through HTTP or model arguments.
export function createPreviewGateway({ signingKeyHex, previewOrigin, platformOrigin, now = Date.now }) {
  const key = signingKey(signingKeyHex)
  const { preview, platform } = previewOrigins(previewOrigin, platformOrigin)
  const mappings = new Map()
  const policy = "default-src 'self' data:; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; " +
    "connect-src 'self'; worker-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; " +
    "sandbox allow-scripts allow-same-origin; frame-ancestors " + platform.origin
  const headers = { 'Cache-Control': 'no-store', 'Pragma': 'no-cache', 'Content-Security-Policy': policy,
    'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), usb=(), payment=()' }
  const deny = (response, status) => {
    response.writeHead(status, { ...headers, 'Content-Type': 'text/html; charset=utf-8' })
    response.end('<!doctype html><meta charset="utf-8"><title>Preview unavailable</title><p>预览凭据失效或产物不可用，请返回平台刷新预览。</p><script>parent.postMessage({type:"codeless-preview",state:"unavailable"},' + JSON.stringify(platform.origin) + ')</script>')
  }
  const server = createServer(async (request, response) => {
    try {
      // Never consume forwarded Host, URL, Cookie or Authorization as routing authority.
      if (!['GET', 'HEAD'].includes(request.method) || !request.url?.startsWith('/') ||
          /[%\\]/.test(request.url) || /(?:^|\/)\.\.(?:\/|$)/.test(request.url)) return deny(response, 403)
      const url = new URL(request.url, preview.origin)
      if (url.origin !== preview.origin) return deny(response, 403)
      let token
      const start = url.pathname === '/__preview/start'
      if (start) {
        if (url.searchParams.size !== 1 || !url.searchParams.has('credential')) return deny(response, 403)
        token = url.searchParams.get('credential')
      } else {
        if (url.search) return deny(response, 403)
        const cookies = (request.headers.cookie ?? '').split(';').map(value => value.trim())
            .filter(value => value.startsWith('__Host-codeless-preview='))
        if (cookies.length !== 1) return deny(response, 403)
        token = cookies[0].slice('__Host-codeless-preview='.length)
      }
      const claims = readCredential(token, key, now())
      if (request.headers.host !== versionHost(claims.version, preview)) return deny(response, 403)
      const mapping = mappings.get(claims.app + ':' + claims.version)
      if (!mapping || mapping.build !== claims.build || mapping.source !== claims.source || mapping.artifact !== claims.artifact)
        return deny(response, 404)
      // A closed handle is never resurrected by a stale mapping.
      const target = browserTarget(mapping.handle)
      if (start) {
        response.writeHead(303, { ...headers, Location: '/',
          'Set-Cookie': '__Host-codeless-preview=' + token + '; Path=/; Secure; HttpOnly; SameSite=None; Partitioned; Max-Age=' +
            Math.max(0, claims.expires - Math.floor(now() / 1000)) })
        return response.end()
      }
      const name = artifactFile(url.pathname, request.headers['sec-fetch-dest'] === undefined ||
          request.headers['sec-fetch-dest'] === 'document' || request.headers['sec-fetch-dest'] === 'iframe')
      if (!name || !target.paths.includes(name)) return deny(response, 404)
      const upstream = await fetch(target.origin + '/' + name, { method: request.method, redirect: 'error',
        signal: AbortSignal.timeout(3000), headers: { 'x-codeless-artifact-token': target.token } })
      if (!upstream.ok) return deny(response, 502)
      // No user headers or platform/preview cookies leave this gateway. No arbitrary proxy destinations.
      let bytes = request.method === 'HEAD' ? undefined : Buffer.from(await upstream.arrayBuffer())
      if (bytes && name === 'index.html') bytes = Buffer.concat([bytes, Buffer.from('<script>addEventListener("load",()=>parent.postMessage({type:"codeless-preview",state:"loaded"},' + JSON.stringify(platform.origin) + '))</script>')])
      response.writeHead(200, { ...headers, 'Content-Type': upstream.headers.get('content-type') ?? 'application/octet-stream',
        ...(bytes ? { 'Content-Length': bytes.length } : {}), 'Cross-Origin-Resource-Policy': 'same-origin' })
      response.end(bytes)
    } catch {
      if (!response.headersSent) deny(response, 403)
      else response.destroy()
    }
  })
  server.on('connect', (_request, socket) => socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n'))
  server.on('upgrade', (_request, socket) => socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n'))
  server.on('clientError', (_error, socket) => socket.destroy())
  server.requestTimeout = 5000; server.headersTimeout = 5000; server.maxConnections = 64
  return {
    server,
    register({ applicationId, versionId, handle, verification }) {
      if (![applicationId, versionId].every(value => uuid.test(value)) || !verification ||
          verification.status !== 'PASSED' || verification.failure !== null || verification.workerExitCode !== 0 ||
          verification.timedOut !== false || !verification.completedAt || !Number.isFinite(Date.parse(verification.completedAt)) ||
          verification.cleanup?.browserClosed !== true || !verification.screenshot ||
          verification.buildId !== handle?.buildId || verification.sourceDigest !== handle?.sourceDigest ||
          verification.artifactDigest !== handle?.artifactDigest) throw new Error('matching successful verification required')
      browserTarget(handle)
      const id = applicationId + ':' + versionId
      if (mappings.has(id)) throw new Error('immutable preview version already registered')
      if (mappings.size >= 1000) throw new Error('preview mapping capacity exceeded')
      mappings.set(id, Object.freeze({ handle, build: handle.buildId, source: handle.sourceDigest, artifact: handle.artifactDigest }))
    },
    revoke(applicationId, versionId) { mappings.delete(applicationId + ':' + versionId) },
    close: () => new Promise((done, reject) => {
      mappings.clear(); server.close(error => error ? reject(error) : done()); server.closeAllConnections()
    })
  }
}
