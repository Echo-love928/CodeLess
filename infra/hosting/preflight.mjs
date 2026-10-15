import { stat, readFile } from 'node:fs/promises'
import { isAbsolute } from 'node:path'
import { spawnSync } from 'node:child_process'
import { X509Certificate, randomUUID } from 'node:crypto'
import { Resolver } from 'node:dns/promises'
import { request } from 'node:https'
import { publicationSite, deploymentUrl, publicAddress } from '../../services/runner/src/publish/policy.mjs'
import { previewOrigins } from '../../services/runner/src/preview/credentials.mjs'
import { hostingConfig } from './render.mjs'

export const requiredSettings = ['CODELESS_NODE_EXECUTABLE', 'CODELESS_PUBLICATION_GATEWAY_ENTRY', 'CODELESS_HOSTING_ROOT',
  'CODELESS_PUBLICATION_ORIGIN', 'CODELESS_PLATFORM_ORIGIN', 'CODELESS_PREVIEW_ORIGIN',
  'CODELESS_HOSTING_CONFIG', 'CODELESS_PLATFORM_CONFIG', 'CODELESS_TLS_CERT', 'CODELESS_TLS_KEY', 'CODELESS_PUBLIC_BIND']

export async function preflight(env = process.env) {
  const missing = requiredSettings.filter(key => !env[key]?.trim())
  if (missing.length) return { status: 'BLOCKED', missing, publicMilestoneReached: false }
  const { site } = publicationSite(env.CODELESS_PUBLICATION_ORIGIN, env.CODELESS_PLATFORM_ORIGIN, env.CODELESS_PREVIEW_ORIGIN)
  previewOrigins(env.CODELESS_PREVIEW_ORIGIN, env.CODELESS_PLATFORM_ORIGIN)
  for (const key of ['CODELESS_NODE_EXECUTABLE', 'CODELESS_PUBLICATION_GATEWAY_ENTRY', 'CODELESS_HOSTING_ROOT', 'CODELESS_TLS_CERT', 'CODELESS_TLS_KEY', 'CODELESS_HOSTING_CONFIG', 'CODELESS_PLATFORM_CONFIG']) {
    if (!isAbsolute(env[key])) throw new Error(key + ': absolute path required')
    const value = await stat(env[key])
    if (key === 'CODELESS_HOSTING_ROOT' ? !value.isDirectory() : !value.isFile()) throw new Error(key + ': file type rejected')
  }
  const expectedConfig = { publicOrigin: env.CODELESS_PUBLICATION_ORIGIN }
  const frontend = JSON.parse(await readFile(env.CODELESS_PLATFORM_CONFIG, 'utf8'))
  if (JSON.stringify(frontend) !== JSON.stringify(expectedConfig)) throw new Error('platform publication configuration mismatch')
  const nginx = await hostingConfig({ publicOrigin: env.CODELESS_PUBLICATION_ORIGIN,
    platformOrigin: env.CODELESS_PLATFORM_ORIGIN, previewOrigin: env.CODELESS_PREVIEW_ORIGIN })
  if (await readFile(env.CODELESS_HOSTING_CONFIG, 'utf8') !== nginx) throw new Error('installed ingress configuration mismatch')
  const version = spawnSync(env.CODELESS_NODE_EXECUTABLE, ['--version'], { encoding: 'utf8', timeout: 5000, windowsHide: true })
  if (version.status !== 0 || version.stdout.trim() !== 'v24.16.0') throw new Error('locked Node24.16.0 required')
  const docker = spawnSync('docker', ['info', '--format', '{{.ServerVersion}}'], { timeout: 10000, encoding: 'utf8', windowsHide: true })
  if (docker.status !== 0) throw new Error('trusted Docker host unavailable')
  const hostname = new URL(deploymentUrl(randomUUID(), site)).hostname
  const certificate = new X509Certificate(await readFile(env.CODELESS_TLS_CERT))
  if (!certificate.checkHost(hostname) || Date.parse(certificate.validTo) <= Date.now() || Date.parse(certificate.validFrom) > Date.now())
    throw new Error('valid wildcard publication certificate required')
  const observations = []
  for (const value of [new URL('/codeless-publication-config.json', env.CODELESS_PLATFORM_ORIGIN).href,
    env.CODELESS_PREVIEW_ORIGIN, `https://${hostname}${site.port ? ':' + site.port : ''}`]) {
    const url = new URL(value), resolver = new Resolver({ timeout: 3000, tries: 1 })
    const [v4, v6] = await Promise.all([resolver.resolve4(url.hostname), resolver.resolve6(url.hostname).catch(error => {
      if (['ENODATA', 'ENOTFOUND'].includes(error.code)) return []; throw error
    })])
    if (!v4.length || v6.length || v4.some(address => !publicAddress(address))) throw new Error('public IPv4-only DNS required')
    const status = await new Promise((done, reject) => {
      const req = request(url, { method: 'GET', lookup: (_name, options, callback) => options.all
        ? callback(null, [{ address: v4[0], family: 4 }]) : callback(null, v4[0], 4), signal: AbortSignal.timeout(5000) }, response => {
        if (response.statusCode >= 300 && response.statusCode < 400 || response.statusCode >= 500) {
          response.destroy(); reject(new Error('direct HTTPS endpoint unavailable')); return
        }
        if (url.pathname !== '/codeless-publication-config.json') { response.destroy(); done(response.statusCode); return }
        let body = '', bytes = 0
        response.on('data', chunk => { bytes += chunk.length; if (bytes > 1024) response.destroy(new Error('platform configuration exceeded')); else body += chunk })
        response.once('error', reject)
        response.once('end', () => {
          try {
            if (response.statusCode !== 200 || JSON.stringify(JSON.parse(body)) !== JSON.stringify(expectedConfig)) throw new Error('served platform publication configuration mismatch')
            done(response.statusCode)
          } catch (error) { reject(error) }
        })
      })
      req.once('error', reject); req.end()
    })
    observations.push({ origin: url.origin, status, certificateValidated: true, dnsPinned: true })
  }
  return { status: 'READY_TO_ENABLE', observations, publicMilestoneReached: false,
    note: 'Resource readiness only. An authenticated user must still click publish and obtain a matching successful deployment.' }
}
if (process.argv[1]?.replaceAll('\\', '/').endsWith('/hosting/preflight.mjs')) {
  try {
    const result = await preflight(); console.log(JSON.stringify(result, null, 2))
    if (result.status === 'BLOCKED') process.exitCode = 2
  } catch (error) {
    console.error(JSON.stringify({ status: 'BLOCKED', reason: error.code ?? error.message, publicMilestoneReached: false })); process.exitCode = 2
  }
}
