// Operator-only prospective diagnostics. No retry, recovery, cleanup or model API.
import fs from 'node:fs'
import { syncBuiltinESMExports } from 'node:module'
import { resolve, relative, isAbsolute, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'

export function observeFileOperations(api, { roots, emit }) {
  let sequence = 0, handleSequence = 0
  const handles = new Map()
  const pathOf = value => {
    if (typeof value !== 'string' && !Buffer.isBuffer(value) && !(value instanceof URL)) return null
    const path = resolve(value instanceof URL ? fileURLToPath(value) : value.toString())
    return roots.some(root => { const rel = relative(root, path); return !isAbsolute(rel) && rel !== '..' && !rel.startsWith('..' + (process.platform === 'win32' ? '\\' : '/')) }) ? path : null
  }
  const log = row => { try { emit({ at: new Date().toISOString(), monotonicNs: process.hrtime.bigint().toString(), pid: process.pid, ppid: process.ppid, ...row }) } catch { /* Telemetry cannot mask an original error. */ } }
  function wrap(target, name, handle = null, handlePath = null) {
    const original = target[name]
    target[name] = async function (...args) {
      const paths = handle ? [handlePath] : [pathOf(args[0]), ...(name === 'rename' ? [pathOf(args[1])] : [])].filter(Boolean)
      if (!paths.length) return original.apply(this, args)
      const id = ++sequence, started = process.hrtime.bigint()
      log({ phase: 'begin', id, operation: name, paths, handle, callStack: new Error('Observed call site').stack })
      try {
        const value = await original.apply(this, args)
        if (name === 'open' && value && typeof value.close === 'function') {
          const key = ++handleSequence
          handles.set(key, { path: paths[0], openedAt: new Date().toISOString() })
          for (const method of ['close', 'write', 'writeFile', 'truncate', 'sync']) if (typeof value[method] === 'function') wrap(value, method, key, paths[0])
          log({ phase: 'handle-open', id, operation: name, handle: key, paths, flags: typeof args[1] === 'string' || typeof args[1] === 'number' ? args[1] : null })
        }
        if (handle && name === 'close') handles.delete(handle)
        log({ phase: 'end', id, operation: name, paths, handle, elapsedNs: (process.hrtime.bigint() - started).toString() })
        return value
      } catch (error) {
        log({ phase: 'error', id, operation: name, paths, handle, code: error?.code ?? null,
          syscall: error?.syscall ?? null, rejectionStack: typeof error?.stack === 'string' ? error.stack : null,
          observedOpenHandles: [...handles].map(([key, data]) => ({ handle: key, ...data })),
          elapsedNs: (process.hrtime.bigint() - started).toString() })
        throw error // Same object, same failure; no swallowed errors or second operation.
      }
    }
  }
  for (const name of ['rename', 'rm', 'rmdir', 'mkdir', 'unlink', 'writeFile', 'open']) wrap(api, name)
  return { observedHandles: () => [...handles].map(([handle, data]) => ({ handle, ...data })) }
}

const configPath = process.env.CODELESS_D28_FS_OBSERVER
if (configPath) {
  const privateRoot = resolve(import.meta.dirname, '.private')
  const owned = path => { const rel = relative(privateRoot, path); return rel && !isAbsolute(rel) && rel !== '..' && !rel.startsWith('..' + (process.platform === 'win32' ? '\\' : '/')) }
  const noLinks = path => { for (let p = resolve(path); ; p = resolve(p, '..')) { if (fs.existsSync(p) && fs.lstatSync(p).isSymbolicLink()) throw new Error('OBSERVER_LINK_REJECTED'); if (resolve(p, '..') === p) break } }
  if (!owned(resolve(configPath))) throw new Error('TASK_PRIVATE_CONFIG_REQUIRED')
  noLinks(configPath)
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'))
  if (!Array.isArray(config.roots) || !config.roots.length || config.roots.some(p => !isAbsolute(p))) throw new Error('EXPLICIT_ABSOLUTE_CAPTURE_ROOTS_REQUIRED')
  const output = resolve(config.output)
  noLinks(output)
  if (!owned(output) || !fs.lstatSync(output).isDirectory() || fs.lstatSync(output).isSymbolicLink()) throw new Error('TASK_PRIVATE_OUTPUT_REQUIRED')
  const localRoot = resolve(import.meta.dirname, '../../../.local-data')
  for (const root of config.roots) {
    const path = resolve(root), rel = relative(localRoot, path), tempRel = relative(resolve(tmpdir()), path)
    const inLocal = rel && !isAbsolute(rel) && rel !== '..' && !rel.startsWith('..' + (process.platform === 'win32' ? '\\' : '/'))
    if (!owned(path) && !inLocal && !/^codeless-[A-Za-z0-9_-]+$/.test(tempRel)) throw new Error('TASK_CAPTURE_ROOT_REQUIRED')
    noLinks(path)
  }
  const path = join(output, `fs-${process.pid}.jsonl`)
  const descriptor = fs.openSync(path, 'wx', 0o600)
  let bytes = 0, limited = false, writeErrors = 0
  const emit = row => {
    if (limited) return
    let raw = JSON.stringify(row) + '\n'
    if (bytes + Buffer.byteLength(raw) > 4 * 1024 * 1024) {
      limited = true
      raw = JSON.stringify({ phase: 'TRUNCATED', pid: process.pid, at: new Date().toISOString(), evidenceComplete: false }) + '\n'
    }
    fs.writeSync(descriptor, raw); bytes += Buffer.byteLength(raw)
  }
  emit({ phase: 'observer-start', pid: process.pid, at: new Date().toISOString(), roots: config.roots,
    scope: 'This process promise API only; not kernel handles, Docker/Java/other writers or historical evidence.',
    timingPerturbedByObservation: true, retriesAdded: 0, fileContentsCaptured: false })
  const observer = observeFileOperations(fs.promises, { roots: config.roots.map(p => resolve(p)), emit: row => { try { emit(row) } catch { writeErrors++ } } })
  syncBuiltinESMExports()
  process.once('exit', code => {
    try { fs.writeSync(descriptor, JSON.stringify({ phase: 'observer-exit', at: new Date().toISOString(), pid: process.pid,
      exitCode: code, writeErrors, limited, observedOpenHandles: observer.observedHandles() }) + '\n') } catch { /* Preserve original process exit. */ }
    try { fs.closeSync(descriptor) } catch { /* Never replace the original exit. */ }
  })
}
