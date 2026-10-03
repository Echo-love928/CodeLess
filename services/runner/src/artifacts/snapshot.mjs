import { createHash } from 'node:crypto'
import { constants } from 'node:fs'
import { lstat, open, readdir, realpath } from 'node:fs/promises'
import { join, relative, sep } from 'node:path'

export const digest = (bytes) => 'sha256:' + createHash('sha256').update(bytes).digest('hex')
export const isDigest = (value) => typeof value === 'string' && /^sha256:[a-f0-9]{64}$/.test(value)

// Read bounded, regular, unlinked files only. Keep the bytes that were actually hashed.
export async function readSnapshot(directory, { files: maxFiles = 2000, bytes: maxBytes = 32 * 1024 * 1024,
  fileBytes = maxBytes, source = false } = {}) {
  const rootStat = await lstat(directory)
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) throw new Error('snapshot root must be a real directory')
  const root = await realpath(directory)
  const buffers = new Map()
  const files = []
  let total = 0, directories = 0
  async function visit(current, depth = 0) {
    if (depth > 16 || ++directories > maxFiles) throw new Error('snapshot directory limit exceeded')
    for (const entry of await readdir(current, { withFileTypes: true })) {
      const path = join(current, entry.name)
      const name = relative(root, path).split(sep).join('/')
      // Excludes traversal, Windows alternate streams, encoded separators and URL ambiguities.
      if (!/^[A-Za-z0-9_./-]+$/.test(name) || name.split('/').some((part) => part === '.' || part === '..')) {
        throw new Error('unsupported snapshot path')
      }
      const stat = await lstat(path)
      if (stat.isSymbolicLink()) throw new Error('snapshot links are forbidden')
      if (stat.isDirectory()) {
        if (source && !/^(src|src\/(?:pages|components|data))$/.test(name)) throw new Error('unapproved source directory')
        await visit(path, depth + 1)
        continue
      }
      if (source && !/^src\/(?:pages|components)\/[A-Za-z][A-Za-z0-9_-]*\.vue$|^src\/data\/[A-Za-z][A-Za-z0-9_-]*\.ts$/.test(name)) {
        throw new Error('unapproved source file')
      }
      if (!stat.isFile() || stat.nlink !== 1 || files.length >= maxFiles ||
          stat.size > fileBytes || total + stat.size > maxBytes) throw new Error('snapshot type or size limit exceeded')
      if (await realpath(path) !== path) throw new Error('snapshot path changed')
      const handle = await open(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0))
      let content
      try {
        const opened = await handle.stat()
        if (!opened.isFile() || opened.nlink !== 1 || opened.dev !== stat.dev || opened.ino !== stat.ino) {
          throw new Error('snapshot file changed')
        }
        // Read one extra byte to detect growth, without unbounded readFile allocation.
        const bytes = Buffer.alloc(Math.min(stat.size, fileBytes, maxBytes - total) + 1)
        let length = 0
        while (length < bytes.length) {
          const read = await handle.read(bytes, length, bytes.length - length, length)
          if (!read.bytesRead) break
          length += read.bytesRead
        }
        if (length !== stat.size) throw new Error('snapshot file changed while reading')
        content = bytes.subarray(0, length)
      } finally { await handle.close() }
      total += content.length
      buffers.set(name, content)
      files.push({ path: name, bytes: content.length, digest: digest(content) })
    }
  }
  await visit(root)
  files.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0)
  return { buffers, manifest: { files, bytes: total, digest: digest(JSON.stringify(files)) } }
}
