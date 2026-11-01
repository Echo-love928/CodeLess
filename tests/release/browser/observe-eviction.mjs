// Read-only failure observer for the original performance test, not a retry or fix.
import fs from 'node:fs'
import { resolve, join, relative, isAbsolute } from 'node:path'
import { tmpdir } from 'node:os'
const destination = process.env.D27_QUEUE_OBSERVER_FILE
if (!destination) throw new Error('Private observer output required')
const base = resolve(import.meta.dirname, '../../../.local-data/d27-b')
const output = resolve(destination), rel = relative(base, output)
if (!rel || isAbsolute(rel) || rel.startsWith('..')) throw new Error('Observer output escaped task root')
fs.writeFileSync(output, JSON.stringify({ event: 'observer-start', node: process.version, platform: process.platform,
  mutation: 'none; calls original rmdir once with unchanged arguments/error; no retries' }) + '\n', { flag: 'wx' })
const original = fs.rmdir
fs.rmdir = function (path, ...args) {
  const callback = args.at(-1), value = resolve(path.toString())
  if (typeof callback === 'function' && value.includes('codeless-d22-') && value.includes('queue') &&
      !relative(resolve(tmpdir()), value).startsWith('..')) {
    args[args.length - 1] = function (error, ...rest) {
      if (error) {
        // Synchronous bounded metadata only after native failure. No file contents or cleanup.
        const event = { event: 'native-rmdir-error', code: error.code, syscall: error.syscall,
          path: relative(resolve(tmpdir()), value), time: new Date().toISOString(), entries: [] }
        try {
          for (const name of fs.readdirSync(value).slice(0, 5)) {
            const stat = fs.lstatSync(join(value, name))
            event.entries.push({ name, type: stat.isSymbolicLink() ? 'link' : stat.isFile() ? 'file' : 'directory',
              bytes: stat.size, mtimeMs: stat.mtimeMs, nlink: stat.nlink })
          }
        } catch (diagnosticError) { event.metadataError = diagnosticError.code }
        try { fs.appendFileSync(output, JSON.stringify(event) + '\n') } catch { /* preserve original error */ }
      }
      return callback.call(this, error, ...rest)
    }
  }
  return original.call(this, path, ...args)
}
