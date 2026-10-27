// Credential-free TLS/JVM gate; never changes truststores, proxies or certificate validation.
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { once } from 'node:events'
import { join, resolve } from 'node:path'
import { createHash } from 'node:crypto'
import { javaHome } from './run-batch.mjs'
import { root } from './lib.mjs'
const output = resolve(process.argv[2])
await mkdir(output, { recursive: false })
const env = { ...process.env }
for (const key of Object.keys(env)) if (/CODELESS_|API_KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL|JAVA_TOOL_OPTIONS|JDK_JAVA_OPTIONS|_JAVA_OPTIONS/.test(key)) delete env[key]
const run = async (name, executable, args) => {
  const child = spawn(executable, args, { cwd: root, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
  const parts = []; child.stdout.on('data', b => parts.push(b)); child.stderr.on('data', b => parts.push(b))
  const [exitCode, signal] = await once(child, 'close'), bytes = Buffer.concat(parts)
  await writeFile(join(output, name + '.log'), bytes, { flag: 'wx' })
  assert.equal(exitCode, 0, name + ' exited unsuccessfully'); assert.equal(signal, null)
  return { text: bytes.toString('utf8'), digest: 'sha256:' + createHash('sha256').update(bytes).digest('hex') }
}
try {
  const git = process.env.CODELESS_EVAL_GIT_BASH ?? 'E:/Git/bin/bash.exe'
  const tls = await run('tls', git, ['evals/generation/evidence/2026-10-25/tls-issuer-probe.sh'])
  const handshakes = tls.text.split(/\r?\n/).filter(line => /#\d+ certs=/.test(line))
  assert.equal(handshakes.length, 12)
  assert.ok(handshakes.every(line => line.includes('issuer=C=CN, O=TrustAsia Technologies, Inc.') && line.endsWith('verify=0 (ok)')))
  const java = javaHome(), classes = join(output, 'classes'); await mkdir(classes)
  await run('javac', join(java, 'bin', 'javac'), ['-d', classes, 'tests/agent/repair/TransportProbe.java'])
  let reached = 0; const probes = []
  for (let i = 0; i < 6; i++) {
    const probe = await run('transport-' + (i + 1), join(java, 'bin', 'java'), ['-cp', classes, 'TransportProbe'])
    reached += probe.text.split(/\r?\n/).filter(line => /received=HTTP_.* status=401 /.test(line)).length
    probes.push(probe.digest)
  }
  assert.equal(reached, 12)
  const docker = await run('docker', 'docker', ['version', '--format', '{{.Server.Version}}'])
  const image = await run('image', 'docker', ['image', 'inspect', 'codeless-vue-build:d05', '--format', '{{.Id}}'])
  await writeFile(join(output, 'preflight.json'), JSON.stringify({ schemaVersion: 1, status: 'PASSED', endpoint: 'https://api.deepseek.com',
    completedAt: new Date().toISOString(), tlsVerified: 12, transportReached: reached, tlsLogDigest: tls.digest,
    transportLogDigests: probes, docker: docker.text.trim(), image: image.text.trim(), modelCalls: 0 }, null, 2) + '\n')
  console.log(JSON.stringify({ output, status: 'PASSED', tlsVerified: 12, transportReached: reached, modelCalls: 0 }))
} catch (error) { await writeFile(join(output, 'failure.json'), JSON.stringify({ status: 'BLOCKED', error: error.message })); console.error(error.message); process.exitCode = 1 }
