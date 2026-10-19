import { constants } from 'node:fs'
import { open, unlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { hostname } from 'node:os'
import { randomUUID } from 'node:crypto'
import { canonical } from '../preview/registry.mjs'
import { uuid } from '../preview/credentials.mjs'

async function readOwner(path) {
  await canonical(path)
  const file = await open(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0))
  try {
    const stat = await file.stat()
    if (!stat.isFile() || stat.nlink !== 1 || stat.size > 1024) throw new Error('QUEUE_OWNER_INVALID')
    const bytes = Buffer.alloc(1025), { bytesRead } = await file.read(bytes, 0, bytes.length, 0)
    if (bytesRead !== stat.size) throw new Error('QUEUE_OWNER_INVALID')
    const owner = JSON.parse(bytes.subarray(0, bytesRead).toString())
    if (!Number.isSafeInteger(owner?.pid) || owner.pid <= 0 || !uuid.test(owner.id ?? '') ||
        (owner.host !== undefined && owner.host !== hostname())) throw new Error('QUEUE_OWNER_INVALID')
    return { owner, bytes: bytes.subarray(0, bytesRead), stat }
  } finally { await file.close() }
}

function ownerAlive(pid) {
  try { process.kill(pid, 0); return true }
  catch (error) {
    if (error.code === 'ESRCH') return false
    // Permission errors, PID reuse and unknown errors never establish death.
    throw new Error('QUEUE_OWNER_UNCONFIRMED')
  }
}

export async function acquireQueueOwner(root) {
  const path = join(root, 'owner.lock'), owner = { pid: process.pid, id: randomUUID(), host: hostname() }
  await writeFile(path, JSON.stringify(owner), { flag: 'wx', mode: 0o600 })
  return async () => {
    const current = await readOwner(path)
    if (current.owner.id !== owner.id || current.owner.pid !== owner.pid) throw new Error('QUEUE_OWNER_CHANGED')
    await unlink(path)
  }
}

// Offline maintenance only: stop ALL coordinators and owned browser trees first.
// Never call this on startup: competing recoverers could remove a newly acquired lock.
export async function recoverQueueOwner(queueRoot, { workersStopped = false } = {}) {
  if (workersStopped !== true) throw new Error('QUEUE_MAINTENANCE_REQUIRED')
  const root = await canonical(queueRoot), path = join(root, 'owner.lock'), first = await readOwner(path)
  if (ownerAlive(first.owner.pid)) throw new Error('QUEUE_OWNER_ALIVE')
  const current = await readOwner(path)
  if (!first.bytes.equals(current.bytes) || first.stat.dev !== current.stat.dev || first.stat.ino !== current.stat.ino)
    throw new Error('QUEUE_OWNER_CHANGED')
  if (ownerAlive(current.owner.pid)) throw new Error('QUEUE_OWNER_ALIVE')
  await unlink(path)
  return { status: 'RECOVERED', pid: current.owner.pid }
}
