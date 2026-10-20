// Independent ZIP reader for D16-A evidence. It shares no code with the Java writer and accepts only the
// archive shape the export contract promises: stored/deflated regular files, no data descriptor, no ZIP64.
import { inflateRawSync, crc32 } from 'node:zlib'
import { mkdirSync, writeFileSync, existsSync, readdirSync } from 'node:fs'
import { dirname, resolve, sep } from 'node:path'

export function readZip(buffer) {
  const end = buffer.length - 22
  if (end < 0 || buffer.readUInt32LE(end) !== 0x06054b50) throw new Error('ZIP end record missing or archive comment present')
  if (buffer.readUInt16LE(end + 4) !== 0 || buffer.readUInt16LE(end + 6) !== 0) throw new Error('multi-disk ZIP rejected')
  const count = buffer.readUInt16LE(end + 10)
  if (count !== buffer.readUInt16LE(end + 8)) throw new Error('inconsistent entry count')
  const size = buffer.readUInt32LE(end + 12), offset = buffer.readUInt32LE(end + 16)
  if (offset + size !== end) throw new Error('central directory is not contiguous with the end record')
  const entries = []
  let p = offset, expectedLocal = 0
  for (let i = 0; i < count; i++) {
    if (buffer.readUInt32LE(p) !== 0x02014b50) throw new Error('bad central directory header')
    const madeBy = buffer.readUInt16LE(p + 4), flags = buffer.readUInt16LE(p + 8), method = buffer.readUInt16LE(p + 10)
    const crc = buffer.readUInt32LE(p + 16), compressed = buffer.readUInt32LE(p + 20), uncompressed = buffer.readUInt32LE(p + 24)
    const nameLength = buffer.readUInt16LE(p + 28), extra = buffer.readUInt16LE(p + 30), comment = buffer.readUInt16LE(p + 32)
    const external = buffer.readUInt32LE(p + 38), local = buffer.readUInt32LE(p + 42)
    const name = buffer.subarray(p + 46, p + 46 + nameLength).toString('latin1')
    if (local !== expectedLocal) throw new Error(`unexpected gap or overlap before ${name}`)
    if (buffer.readUInt32LE(local) !== 0x04034b50) throw new Error(`bad local header for ${name}`)
    const localFlags = buffer.readUInt16LE(local + 6), localMethod = buffer.readUInt16LE(local + 8)
    const localName = buffer.readUInt16LE(local + 26), localExtra = buffer.readUInt16LE(local + 28)
    if (buffer.subarray(local + 30, local + 30 + localName).toString('latin1') !== name || localFlags !== flags || localMethod !== method
        || buffer.readUInt32LE(local + 14) !== crc || buffer.readUInt32LE(local + 18) !== compressed || buffer.readUInt32LE(local + 22) !== uncompressed)
      throw new Error(`local and central headers disagree for ${name}`)
    if (flags & 0x0009) throw new Error(`encrypted or data-descriptor member rejected: ${name}`)
    const start = local + 30 + localName + localExtra, raw = buffer.subarray(start, start + compressed)
    const data = method === 0 ? Buffer.from(raw) : method === 8 ? inflateRawSync(raw) : null
    if (!data) throw new Error(`unsupported compression ${method} for ${name}`)
    if (data.length !== uncompressed || crc32(data) !== crc) throw new Error(`size or CRC mismatch for ${name}`)
    entries.push({ name, madeBy, flags, method, extra: extra + localExtra, comment, mode: external >>> 16, dosAttributes: external & 0xffff, data })
    expectedLocal = start + compressed
    p += 46 + nameLength + extra + comment
  }
  if (expectedLocal !== offset) throw new Error('unreferenced bytes before the central directory')
  return entries
}

/** Extracts into a new empty directory; every member must resolve strictly inside it. */
export function extract(entries, target) {
  const root = resolve(target)
  if (existsSync(root) && readdirSync(root).length) throw new Error('extraction target must be new or empty')
  for (const entry of entries) {
    const file = resolve(root, entry.name)
    if (!file.startsWith(root + sep)) throw new Error(`path escapes extraction root: ${entry.name}`)
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, entry.data, { flag: 'wx', mode: 0o644 })
  }
  return root
}

export function rootFolder(entries) {
  const roots = new Set(entries.map(e => e.name.split('/')[0]))
  if (roots.size !== 1) throw new Error('archive must contain exactly one root folder')
  return [...roots][0]
}
