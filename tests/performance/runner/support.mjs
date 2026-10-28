import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readdir, readFile, lstat } from 'node:fs/promises'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tmpdir, cpus, totalmem, release, platform } from 'node:os'

export const root = fileURLToPath(new URL('../../../', import.meta.url))
export const sha = bytes => 'sha256:' + createHash('sha256').update(bytes).digest('hex')
export function command(cmd, args, timeout = 180000) {
  const value = spawnSync(cmd, args, { cwd: root, encoding: 'utf8', timeout, windowsHide: true })
  assert.equal(value.error, undefined, String(value.error))
  assert.equal(value.status, 0, value.stderr)
  return value.stdout.trim()
}
export const docker = args => command('docker', args)
export const sleep = ms => new Promise(done => setTimeout(done, ms))
export async function dockerAsync(args) {
  return new Promise((done, reject) => {
    const child = spawn('docker', args, { cwd: root, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
    let out = '', err = ''
    const timer = setTimeout(() => child.kill(), 15000)
    child.stdout.on('data', b => { out += b }); child.stderr.on('data', b => { err += b })
    child.once('error', reject)
    child.once('close', code => { clearTimeout(timer); code === 0 ? done(out.trim()) : reject(new Error(`docker exit ${code}: ${err}`)) })
  })
}
export async function codeIdentity() {
  const paths = command('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z']).split('\0')
    .filter(p => p && !p.includes('/evidence/') && /^(services\/runner\/|infra\/(runner|build-image)\/|templates\/vue\/|tests\/performance\/runner\/)/.test(p))
  return Object.fromEntries(await Promise.all(paths.map(async p => [p, sha(await readFile(join(root, p)))])))
}
export function machine(image = 'codeless-vue-build:d05') {
  const info = JSON.parse(docker(['info', '--format', '{{json .}}']))
  return { node: process.version, platform: platform(), release: release(), cpu: cpus()[0]?.model ?? null,
    logicalCpus: cpus().length, memoryBytes: totalmem(), docker: { version: info.ServerVersion,
      os: info.OperatingSystem, cpus: info.NCPU, memoryBytes: info.MemTotal, driver: info.Driver,
      cgroupVersion: info.CgroupVersion }, imageId: docker(['image', 'inspect', image, '--format', '{{.Id}}']) }
}
export async function disk(path) {
  let bytes = 0, files = 0
  for (const entry of await readdir(path, { withFileTypes: true })) {
    const target = join(path, entry.name), stat = await lstat(target)
    assert.equal(stat.isSymbolicLink(), false)
    if (stat.isDirectory()) { const child = await disk(target); bytes += child.bytes; files += child.files }
    else { bytes += stat.size; files++ }
  }
  return { bytes, files }
}
export async function staging() {
  return (await readdir(tmpdir())).filter(p => p.startsWith('codeless-build-')).sort()
}
export function ownedPath(parent, child) {
  assert.equal(dirname(resolve(child)), resolve(parent), 'cleanup must stay in the exact owned parent')
  return child
}
export async function waitForOOM(id) {
  const deadline = Date.now() + 10000
  while (Date.now() < deadline) {
    const state = JSON.parse(await dockerAsync(['inspect', id, '--format', '{{json .State}}']))
    if (state.Running && state.OOMKilled === true) {
      return { state, observedAt: new Date().toISOString(), monotonicMs: performance.now() }
    }
    assert.notEqual(state.Status, 'exited', 'OOM guardian exited before daemon acknowledgement')
    await sleep(50)
  }
  throw new Error('OOM acknowledgement deadline')
}
export async function observeOOM(id) {
  const observed = await waitForOOM(id)
  await dockerAsync(['kill', '--signal', 'USR2', id])
  return observed.state
}
