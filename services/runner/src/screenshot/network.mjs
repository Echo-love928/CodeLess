import https from 'node:https'
import { publicAddress, publicFile } from '../publish/probe-policy.mjs'
import { digest } from '../artifacts/snapshot.mjs'

export function validateTarget(job) {
  const url = new URL(job.url)
  if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash ||
      !/^d[a-f0-9]{32}\./.test(url.hostname) || !publicAddress(job.address) ||
      !['/', '/tasks', '/catalog'].includes(job.entryPath === undefined ? '/' : job.entryPath) ||
      !Number.isFinite(job.deadline) || job.deadline <= Date.now() || job.deadline > Date.now() + 30000 ||
      !Array.isArray(job.files) || job.files.length < 2 || job.files.length > 2000 ||
      new Set(job.files.map(file => file.path)).size !== job.files.length ||
      job.files.some(file => !publicFile(file.path) || !/^sha256:[a-f0-9]{64}$/.test(file.digest) ||
        !Number.isSafeInteger(file.bytes) || file.bytes < 0) ||
      job.files.reduce((sum, file) => sum + file.bytes, 0) > 32 * 1024 * 1024 ||
      !job.files.some(file => file.path === 'index.html') || !job.files.some(file => file.path.endsWith('.js')))
    throw new Error('TARGET_REJECTED')
  return url
}

// Browser traffic is fulfilled from these exact HTTPS reads, never route.continue/fetch.
// TLS verification stays enabled, DNS is pinned, 3xx are rejected, no cookies/proxies are inherited.
export function createAssetReader(job, request = https.request) {
  const origin = validateTarget(job)
  let total = 0
  const pending = new Map()
  return function asset(path) {
    const expected = job.files.find(file => '/' + file.path === path)
    if (!expected) return Promise.reject(new Error('TARGET_REJECTED'))
    if (pending.has(path)) return pending.get(path)
    const run = new Promise((done, reject) => {
      if (Date.now() >= job.deadline) return reject(new Error('CAPTURE_TIMEOUT'))
      const timeout = Math.max(1, Math.min(3000, job.deadline - Date.now()))
      let timer
      const req = request({ protocol: 'https:', hostname: origin.hostname, port: origin.port || 443,
        path: path === '/index.html' && job.entryPath && job.entryPath !== '/' ? job.entryPath : path,
        method: 'GET', servername: origin.hostname, agent: false, timeout,
        lookup: (_host, options, callback) => options.all ? callback(null, [{ address: job.address, family: 4 }]) : callback(null, job.address, 4),
        headers: { Accept: '*/*', 'Accept-Encoding': 'identity' } }, response => {
        if (response.statusCode !== 200 || response.headers['content-encoding'] && response.headers['content-encoding'] !== 'identity') {
          response.resume(); req.destroy(new Error('PUBLIC_CONTENT_MISMATCH')); return
        }
        const chunks = []; let size = 0
        response.on('data', chunk => {
          size += chunk.length; total += chunk.length
          if (size > expected.bytes || total > 32 * 1024 * 1024) req.destroy(new Error('PUBLIC_CONTENT_MISMATCH'))
          else chunks.push(chunk)
        })
        response.once('error', reject)
        response.once('end', () => {
          const bytes = Buffer.concat(chunks)
          if (bytes.length !== expected.bytes || digest(bytes) !== expected.digest) reject(new Error('PUBLIC_CONTENT_MISMATCH'))
          else done(bytes)
        })
      })
      timer = setTimeout(() => req.destroy(new Error('CAPTURE_TIMEOUT')), timeout)
      req.once('error', reject); req.once('close', () => clearTimeout(timer))
      req.once('timeout', () => req.destroy(new Error('CAPTURE_TIMEOUT'))); req.end()
    })
    pending.set(path, run)
    return run
  }
}
