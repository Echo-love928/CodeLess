// Controlled native late-write model from the runner maintainer's diagnosis.
// It demonstrates ENOTEMPTY consequences, not the cause or resolution of A's incident.
import fs from 'node:fs'
import * as fsp from 'node:fs/promises'
import { randomUUID, createHash } from 'node:crypto'
import { resolve, join, relative, isAbsolute } from 'node:path'
import assert from 'node:assert/strict'
const output = resolve(process.argv[2]), base = resolve(import.meta.dirname, '../../../.local-data/d27-b')
const rel = relative(base, output)
assert.ok(rel && !isAbsolute(rel) && !rel.startsWith('..'))
await fsp.mkdir(output)
let target, calls = 0, inject = false, injected = false
const original = fs.rmdir
fs.rmdir = function (path, ...args) {
  if (target && resolve(path.toString()) === target) {
    calls++
    if (inject && calls === 2) {
      assert.ok(target.startsWith(output + (process.platform === 'win32' ? '\\' : '/')))
      fs.writeFileSync(join(target, 'controlled-late-writer.json'), '{}'); injected = true
    }
  }
  return original.call(this, path, ...args)
}
const { createScreenshotQueue } = await import('../../../services/runner/src/screenshot/queue.mjs')
const sha = value => 'sha256:' + createHash('sha256').update(value).digest('hex')
const report = { task: 'D27-B', originalIncidentCause: 'UNKNOWN', originalIncidentStatus: 'OPEN',
  originalRunner: '284/285', originalCiGateExit: 1, node: process.version, platform: process.platform,
  queueRawSha256: sha(await fsp.readFile(new URL('../../../services/runner/src/screenshot/queue.mjs', import.meta.url))), results: [] }
try {
  for (const fault of [false, true]) {
    const queueRoot = join(output, fault ? 'controlled-late-write' : 'control'); await fsp.mkdir(queueRoot)
    const identity = { applicationId: randomUUID(), versionId: randomUUID(), sourceDigest: sha('source'), artifactDigest: sha('artifact') }
    const config = { queueRoot, maxAttempts: 1 }
    const dependencies = { resolveTarget: async () => identity,
      capture: async () => ({ status: 'FAILED', failure: 'CAPTURE_FAILED', cleanupConfirmed: true }) }
    const queue = await createScreenshotQueue(config, dependencies)
    const ids = Array.from({ length: 101 }, () => randomUUID())
    let error
    try {
      for (const id of ids.slice(0, 100)) await queue.enqueue(id)
      assert.equal((await queue.runNext()).status, 'FAILED')
      target = join(queueRoot, ids[0]); calls = 0; inject = fault; injected = false
      try { await queue.enqueue(ids[100]) } catch (value) { error = value }
      const row = { faultInjected: fault, injected, nativeError: error ? { code: error.code, syscall: error.syscall } : null,
        rmdirCalls: calls, terminalInMap: queue.get(ids[0])?.status ?? null, newAdmission: queue.get(ids[100])?.status ?? null,
        remainingFiles: fs.existsSync(target) ? await fsp.readdir(target) : [] }
      report.results.push(row)
      if (fault) {
        assert.equal(error?.code, 'ENOTEMPTY'); assert.equal(queue.get(ids[100]), null)
        assert.deepEqual(row.remainingFiles, ['controlled-late-writer.json'])
      } else { assert.equal(error, undefined); assert.equal(queue.get(ids[0]), null) }
    } finally { await queue.close(); target = undefined }
    if (fault) {
      await assert.rejects(createScreenshotQueue(config, dependencies), /QUEUE_STORAGE_INVALID/)
      report.restartRejectedCorruptDirectory = true
    }
  }
  report.status = 'EXPECTED_CONTROL_AND_NATIVE_FAILURE_OBSERVED'
} finally {
  fs.rmdir = original
  await fsp.writeFile(join(output, 'model.json'), JSON.stringify(report, null, 2) + '\n')
}
console.log(JSON.stringify(report))
