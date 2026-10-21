import { chmod, mkdir, rename, rm, writeFile } from 'node:fs/promises'
import { basename, dirname, join, resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import { canonical } from '../preview/registry.mjs'
import { digest, readSnapshot } from '../artifacts/snapshot.mjs'
import { uuid } from '../preview/credentials.mjs'
import { publicFile } from './probe-policy.mjs'

function admittedInput(receipt, buffers) {
  const reject = () => { throw new Error('publication input rejected') }
  if (typeof receipt?.deploymentId !== 'string' || receipt.deploymentId.length !== 36 || !uuid.test(receipt.deploymentId) ||
      !(buffers instanceof Map) || buffers.size < 2 || buffers.size > 2000) reject()
  const names = new Set(), frozen = new Map()
  let total = 0
  for (const [name, bytes] of buffers) {
    if (typeof name !== 'string' || name.length > 240 || /[^A-Za-z0-9_./-]/.test(name) || !publicFile(name) ||
        /(?:^|\/)(?:CON|PRN|AUX|NUL|COM[0-9]+|LPT[0-9]+)(?:\.|$)/i.test(name) ||
        names.has(name.toLowerCase()) || !Buffer.isBuffer(bytes)) reject()
    names.add(name.toLowerCase()); total += bytes.length
    if (total > 32 * 1024 * 1024) reject()
    frozen.set(name, Buffer.from(bytes))
  }
  if (!frozen.has('index.html') || ![...frozen.keys()].some(name => name.endsWith('.js'))) reject()
  const json = JSON.stringify(receipt)
  if (Buffer.byteLength(json) > 1024 * 1024) reject()
  // Freeze before the first await: callers cannot mutate accepted paths or bytes
  // while canonical checks and asynchronous filesystem writes are in progress.
  return { receipt: JSON.parse(json), buffers: frozen }
}

// Shared immutable writer; callers must first establish a trusted verified binding.
export async function createPublicationStore(hostingRoot) {
  const root = await canonical(hostingRoot)
  const pendingRoot = join(dirname(root), basename(root) + '-staging')
  await mkdir(pendingRoot, { recursive: true, mode: 0o700 })
  await canonical(pendingRoot)
  return async (inputReceipt, inputBuffers, deadline = Infinity) => {
    const { receipt, buffers } = admittedInput(inputReceipt, inputBuffers)
    const deploymentId = receipt.deploymentId, publishedFiles = receipt.files
    const check = () => { if (Date.now() >= deadline) throw new Error('DEPLOYMENT_TIMEOUT') }
    check(); await canonical(root); await canonical(pendingRoot)
    const destination = join(root, deploymentId)
    try {
      await canonical(destination)
      // Public bytes retain the 32MiB/2000 quota. The private receipt is an
      // additional file (at most ~750KiB), not part of the generated artifact.
      const existing = await readSnapshot(destination, { files: 2001, bytes: 33 * 1024 * 1024 })
      if (existing.buffers.get('__deployment.json')?.toString('utf8') !== JSON.stringify(receipt) ||
        existing.manifest.files.length !== publishedFiles.length + 1 || publishedFiles.some(file =>
          !existing.buffers.has(file.path) || digest(existing.buffers.get(file.path)) !== file.digest))
        throw new Error('deployment ID already bound to different content')
      return receipt
    } catch (error) { if (error.code !== 'ENOENT') throw error }
    const staging = join(pendingRoot, randomUUID())
    await mkdir(staging, { mode: 0o700 })
    try {
      for (const [name, bytes] of buffers) {
        check()
        const path = join(staging, name)
        await mkdir(dirname(path), { recursive: true, mode: 0o755 })
        await writeFile(path, bytes, { flag: 'wx', mode: 0o644 })
        // Explicit public modes must survive a private worker's restrictive umask.
        // The staging parent and the private receipt remain owner-only.
        if (dirname(path) !== staging) await chmod(dirname(path), 0o755)
        await chmod(path, 0o644)
      }
      await writeFile(join(staging, '__deployment.json'), JSON.stringify(receipt), { flag: 'wx', mode: 0o600 })
      await chmod(staging, 0o755)
      await canonical(root); await canonical(pendingRoot)
      // Public hostnames match UUID directories only; partially written staging is inaccessible.
      check()
      await rename(staging, destination)
      return receipt
    } finally {
      if (dirname(resolve(staging)) !== pendingRoot) throw new Error('cleanup escaped staging root')
      await rm(staging, { recursive: true, force: true })
    }
  }
}
