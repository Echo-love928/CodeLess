// Real candidate nginx/TLS fixture. Does not claim public DNS or an API deployment.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { readFile, writeFile, mkdir, chmod } from 'node:fs/promises'
import { resolve, join, dirname } from 'node:path'
import https from 'node:https'
import { verify, hash } from '../../../infra/release/client/package.mjs'
const [commit, bundlePath, outputPath] = process.argv.slice(2)
const bundle = resolve(bundlePath), output = resolve(outputPath)
const manifest = await verify(bundle, commit)
await mkdir(output)
const report = { task: 'D27-B', commit, scope: 'real pinned nginx / local trusted test CA / formal candidate config; not public deployment',
  status: 'RUNNING', checks: [], containerCleanup: null, apiDeployed: false, publicAcceptance: false }
let container
function run(cmd, args, env) {
  const result = spawnSync(cmd, args, { encoding: 'utf8', windowsHide: true, timeout: 60000, env })
  if (result.error || result.status !== 0 || result.signal) {
    const error = new Error('Fixture command failed'); error.log = (result.stdout ?? '') + (result.stderr ?? '')
    error.exitCode = result.status; throw error
  }
  return result.stdout.trim()
}
const docker = args => run('docker', args)
try {
  const compose = run('git', ['show', `${commit}:infra/public/compose.yml`])
  const image = compose.match(/image: (nginx:[^\r\n]+)/)?.[1]
  assert.ok(image?.includes('@sha256:'))
  let openssl = 'openssl'
  if (process.platform === 'win32') openssl = resolve(dirname(run('where.exe', ['git']).split(/\r?\n/)[0]), '../usr/bin/openssl.exe')
  const cert = join(output, 'server.pem'), key = join(output, 'server.key')
  const host = new URL(manifest.config.platformOrigin).hostname
  run(openssl, ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', key, '-out', cert, '-days', '1',
    '-subj', '/CN=' + host, '-addext', 'subjectAltName=DNS:' + host], { ...process.env, MSYS_NO_PATHCONV: '1' })
  // Disposable fixture key only. Never change permissions of operator credentials.
  await chmod(key, 0o644)
  const mount = (source, target) => ['--mount', `type=bind,source=${source},target=${target},readonly`]
  const limits = ['--user', '101:101', '--read-only', '--cap-drop=ALL', '--security-opt=no-new-privileges',
    '--pids-limit=64', '--memory=128m', '--cpus=0.5', '--tmpfs', '/var/run:uid=101,gid=101', '--tmpfs', '/var/cache/nginx:uid=101,gid=101']
  for (const name of ['edge', 'platform', 'hosting']) {
    const target = name === 'edge' ? '/etc/nginx/edge.conf' : '/etc/nginx/conf.d/default.conf'
    const args = ['run', '--rm', '--network=none', ...limits, '--add-host=host.docker.internal:127.0.0.1',
      ...mount(join(bundle, 'ingress', name + '.conf'), target), ...mount(output, '/certs'), '--entrypoint=nginx', image,
      '-t', ...(name === 'edge' ? ['-c', target] : [])]
    docker(args)
    report.checks.push({ name: name + ' nginx -t', exitCode: 0 })
  }
  const env = { ...process.env, CODELESS_INGRESS_GID: '101', CODELESS_DATABASE_PASSWORD: 'D27_SYNTHETIC_COMPOSE_ONLY' }
  const composeFile = join(output, 'compose.yml'); await writeFile(composeFile, compose)
  run('docker', ['compose', '-f', composeFile, 'config', '--quiet'], env)
  report.checks.push({ name: 'formal compose config --quiet (synthetic settings; no up)', exitCode: 0 })
  container = docker(['run', '-d', ...limits, '--add-host=host.docker.internal:127.0.0.1', '-p', '127.0.0.1::8443',
    ...mount(join(bundle, 'ingress/platform.conf'), '/etc/nginx/conf.d/default.conf'),
    ...mount(join(bundle, 'web'), '/usr/share/nginx/html'), ...mount(output, '/certs'), '--entrypoint=nginx', image, '-g', 'daemon off;'])
  assert.match(container, /^[a-f0-9]{64}$/)
  const port = Number(docker(['port', container, '8443']).split(':').at(-1))
  const ca = await readFile(cert)
  async function get(path) {
    return new Promise((done, reject) => {
      const request = https.get({ hostname: '127.0.0.1', port, path, servername: host, ca,
        rejectUnauthorized: true, headers: { Host: host }, signal: AbortSignal.timeout(10000) }, response => {
        const authorized = response.socket.authorized
        const chunks = []; response.on('data', c => chunks.push(c)); response.on('error', reject)
        response.on('end', () => done({ status: response.statusCode, body: Buffer.concat(chunks), type: response.headers['content-type'], authorized }))
      }); request.on('error', reject)
    })
  }
  for (const path of ['/', '/apps', '/workbench/00000000-0000-4000-8000-000000000001']) {
    const response = await get(path)
    assert.equal(response.status, 200); assert.equal(response.authorized, true)
    assert.equal(hash(response.body), manifest.files['web/index.html'].sha256)
    report.checks.push({ name: 'actual nginx route fallback', path, exitCode: 0 })
  }
  for (const [file, meta] of Object.entries(manifest.files).filter(([p]) => p.startsWith('web/assets/'))) {
    const response = await get('/' + file.slice(4))
    assert.equal(response.status, 200); assert.equal(hash(response.body), meta.sha256)
    if (file.endsWith('.js')) assert.match(response.type, /javascript/)
    if (file.endsWith('.css')) assert.match(response.type, /css/)
    report.checks.push({ name: 'actual nginx asset bytes and MIME', path: file.slice(4), exitCode: 0 })
  }
  assert.equal((await get('/internal/preview/health')).status, 404)
  report.checks.push({ name: 'private route rejected', exitCode: 0 })
  report.status = 'PASSED'
} catch (error) {
  report.status = 'FAILED'; report.error = error.code ?? error.name; report.commandExitCode = error.exitCode ?? null
  if (error.log) await writeFile(join(output, 'failure.log'), error.log)
  process.exitCode = 1
} finally {
  if (container) {
    try { docker(['rm', '-f', container]); report.containerCleanup = 'PASSED' }
    catch { report.containerCleanup = 'FAILED'; report.status = 'FAILED'; process.exitCode = 1 }
  }
  await writeFile(join(output, 'ingress.json'), JSON.stringify(report, null, 2) + '\n')
  console.log(JSON.stringify(report))
}
