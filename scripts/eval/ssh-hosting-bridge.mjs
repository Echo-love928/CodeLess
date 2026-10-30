// Operator-only transport for the existing frozen publication protocol. No model/HTTP tool registration.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { appendFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
export function validateBridgeJob(job, publicOrigin, now = Date.now()) {
  assert.ok(job && typeof job === 'object' && !Array.isArray(job))
  assert.ok(['publish', 'probe'].includes(job.action))
  assert.deepEqual(Object.keys(job).sort(), (job.action === 'publish' ? ['action', 'deadline', 'payload'] : ['action', 'deadline', 'payload', 'url']).sort())
  const remaining = Date.parse(job.deadline) - now; assert.ok(remaining > 3000 && remaining <= 30000)
  assert.match(job.payload?.publicationId ?? '', /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/)
  if (job.action === 'probe') {
    const origin = new URL(publicOrigin)
    assert.equal(job.url, 'https://d' + job.payload.publicationId.replaceAll('-', '') + '.' + origin.host + '/')
  }
  return remaining
}
export function fixedRemoteCommand(config) {
  const path = value => { assert.match(value, /^\/[A-Za-z0-9_./-]+$/); assert.ok(!value.split('/').includes('..')); return value }
  const origin = value => { const u = new URL(value); assert.equal(u.protocol, 'https:'); assert.ok(!u.username && !u.password && !u.search && !u.hash && u.pathname === '/'); assert.match(u.host, /^[a-z0-9.-]+(?::\d+)?$/); return u.origin }
  const prefix = []
  if (config.runAs) { assert.match(config.runAs, /^[a-z_][a-z0-9_-]*$/); prefix.push('runuser', '-u', config.runAs, '--') }
  return [...prefix, 'env', '-i', 'PATH=/usr/bin:/bin', 'CODELESS_HOSTING_ROOT=' + path(config.hostingRoot),
    'CODELESS_PUBLICATION_ORIGIN=' + origin(config.publicOrigin), 'CODELESS_PLATFORM_ORIGIN=' + origin(config.platformOrigin),
    'CODELESS_PREVIEW_ORIGIN=' + origin(config.previewOrigin), path(config.workerClient), path(config.gatewayEntry)].join(' ')
}
export function sshChildEnvironment(base, configured = {}) {
  const allowed = /^(?:PATH|SystemRoot|WINDIR|TEMP|TMP|USERPROFILE|USERNAME|USERDOMAIN|APPDATA|LOCALAPPDATA|HOMEDRIVE|HOMEPATH|OS|SystemDrive|ProgramData)$/i
  assert.ok(Object.keys(configured).every(k => allowed.test(k)), 'Only operator OS metadata may be supplied')
  return { ...Object.fromEntries(Object.entries(base).filter(([k]) => allowed.test(k))), ...configured }
}
export async function runSshHostingBridge(config) {
  const chunks = []; let size = 0
  for await (const b of process.stdin) { size += b.length; assert.ok(size <= 48 * 1024 * 1024); chunks.push(b) }
  const input = Buffer.concat(chunks), job = JSON.parse(input), remaining = validateBridgeJob(job, config.publicOrigin)
  assert.match(config.host, /^[a-z_][a-z0-9_-]*@[a-z0-9.-]+$/); assert.ok(Number.isInteger(config.port) && config.port > 0 && config.port < 65536)
  const command = fixedRemoteCommand(config), args = ['-i', config.identityFile, '-p', String(config.port), '-o', 'BatchMode=yes', '-o', 'IdentitiesOnly=yes',
    '-o', 'StrictHostKeyChecking=yes', '-o', 'UserKnownHostsFile=' + config.knownHostsFile, '-o', 'ConnectTimeout=5', config.host, command]
  const env = sshChildEnvironment(process.env, config.sshEnvironment)
  const result = spawnSync(config.sshExecutable, args, { env, input, windowsHide: true, timeout: remaining, maxBuffer: 1024 * 1024 })
  const sha = b => 'sha256:' + createHash('sha256').update(b).digest('hex')
  appendFileSync(config.auditLog, JSON.stringify({ at: new Date().toISOString(), action: job.action, publicationId: job.payload.publicationId,
    versionId: job.payload.versionId, inputSha256: sha(input), inputBytes: input.length, exitCode: result.status,
    signal: result.signal, error: result.error?.code ?? null, stdoutSha256: sha(result.stdout ?? Buffer.alloc(0)),
    stderrSha256: sha(result.stderr ?? Buffer.alloc(0)), retries: 0 }) + '\n')
  assert.equal(result.status, 0, 'Native remote gateway failed; do not retry')
  const response = JSON.parse(result.stdout.toString('utf8'))
  assert.deepEqual(Object.keys(response).sort(), job.action === 'publish' ? ['url'] : ['accessible', 'artifactDigest', 'versionId'])
  process.stdout.write(JSON.stringify(response))
}
