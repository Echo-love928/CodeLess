import https from 'node:https'
import { createHash } from 'node:crypto'
import { pathToFileURL } from 'node:url'
import { publicAddress, publicFile } from './probe-policy.mjs'

const hash = bytes => 'sha256:' + createHash('sha256').update(bytes).digest('hex')
// No browser, scripts, credentials, redirects, proxy or page-selected destinations.
// lookup is pinned for EVERY connection, so a second DNS answer cannot redirect to an internal service.
export async function inspectTarget({ url, address, files, deadline = Date.now() + 25000 }, request = https.request) {
  const origin = new URL(url)
  const observations = []
  let total = 0
  async function get(path, expected, missing = false) {
    if (Date.now() >= deadline) throw new Error('probe deadline exceeded')
    const observation = await new Promise((done, reject) => {
      const req = request({ protocol: origin.protocol, hostname: origin.hostname, port: origin.port || 443,
        path, method: 'GET', servername: origin.hostname, agent: false,
        lookup: (_host, options, callback) => options.all
          ? callback(null, [{ address, family: 4 }]) : callback(null, address, 4),
        headers: { Accept: '*/*' }, timeout: Math.max(1, Math.min(3000, deadline - Date.now())) }, response => {
        const chunks = []
        response.on('data', chunk => {
          total += chunk.length
          if (total > 40 * 1024 * 1024) req.destroy(new Error('probe size exceeded'))
          else chunks.push(chunk)
        })
        response.on('error', reject)
        response.on('end', () => done({ path, status: response.statusCode, type: response.headers['content-type'] ?? null,
          bytes: Buffer.concat(chunks).length, digest: hash(Buffer.concat(chunks)) }))
      })
      req.on('timeout', () => req.destroy(new Error('probe timeout')))
      req.on('error', reject); req.end()
    })
    observations.push(observation)
    if (missing ? observation.status !== 404 || observation.type?.includes('text/html') :
      observation.status !== 200 || observation.digest !== expected.digest || observation.bytes !== expected.bytes ||
      (path.endsWith('.js') && !/^(?:text|application)\/javascript/.test(observation.type ?? '')) ||
      (path.endsWith('.css') && !observation.type?.startsWith('text/css')) ||
      (['/', '/tasks', '/catalog'].includes(path) && !observation.type?.startsWith('text/html')))
      throw new Error('PUBLIC_ACCESS_MISMATCH: ' + path)
  }
  try {
    if (!Array.isArray(files) || files.length < 2 || files.length > 2000 || files.some(file =>
      !publicFile(file.path) || !/^sha256:[a-f0-9]{64}$/.test(file.digest) || !Number.isSafeInteger(file.bytes) || file.bytes < 0))
      throw new Error('invalid probe manifest')
    const index = files.find(file => file.path === 'index.html')
    if (!index || !files.some(file => file.path.endsWith('.js'))) throw new Error('invalid probe manifest')
    await get('/', index)
    await get('/tasks', index)
    await get('/catalog', index)
    for (const file of files.filter(file => file.path !== 'index.html')) await get('/' + file.path, file)
    for (const path of ['/assets/missing.js', '/src/pages/HomePage.vue', '/assets/', '/ai-component-catalog.json',
      '/__deployment.json', '/.git/config', '/api/v0/publications']) await get(path, null, true)
    return { status: 'PASSED', failure: null, observations }
  } catch (error) { return { status: 'FAILED', failure: error.message.slice(0, 200), observations } }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  let input = '', size = 0
  for await (const chunk of process.stdin) {
    size += chunk.length
    if (size > 512 * 1024) throw new Error('probe job size exceeded')
    input += chunk
  }
  const job = JSON.parse(input), url = new URL(job.url)
  if (url.protocol !== 'https:' || url.pathname !== '/' || url.search || url.hash || url.username || url.password ||
    !publicAddress(job.address)) throw new Error('public probe target rejected')
  if (!Number.isFinite(job.deadline) || job.deadline <= Date.now() || job.deadline > Date.now() + 30000) throw new Error('probe deadline rejected')
  const deadline = setTimeout(() => process.exit(2), Math.max(1, job.deadline - Date.now()))
  const result = await inspectTarget(job)
  clearTimeout(deadline)
  process.stdout.write(JSON.stringify(result))
  process.exitCode = result.status === 'PASSED' ? 0 : 1
}
