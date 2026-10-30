// Offline encrypted transfer only. Never upload, import SQL, log the AES key or include account/model credentials.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { readFileSync, writeFileSync, mkdirSync, readdirSync, lstatSync, existsSync, copyFileSync } from 'node:fs'
import { resolve, join, relative, isAbsolute } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createHash, randomBytes } from 'node:crypto'
import { CANDIDATE, IDS, contained } from './budgeted-batch.mjs'
import { encryptPrivateBytes, decryptPrivateBytes, encryptedDigest } from './private-handoff-crypto.mjs'
const root = resolve(fileURLToPath(new URL('../../', import.meta.url)))
const sha = b => 'sha256:' + createHash('sha256').update(b).digest('hex')
const json = p => JSON.parse(readFileSync(p, 'utf8'))
export function safeMember(name) {
  assert.equal(typeof name, 'string'); assert.ok(name && !/[\x00-\x1f\x7f\\]/.test(name), 'Unsafe archive name')
  const clean = name.replace(/^(?:\.\/)+/, '').replace(/\/$/, '')
  if (!clean || clean === '.') return ''
  assert.ok(!isAbsolute(clean) && !/^[A-Za-z]:/.test(clean) && !clean.split('/').some(p => p === '..' || p === ''), 'Archive traversal rejected')
  return clean
}
export function validateRetained(sample, id, batchId) {
  assert.ok(IDS.includes(id)); assert.equal(sample.sampleId, id); assert.equal(sample.batchId, batchId)
  assert.equal(sample.mode, 'REAL'); assert.equal(sample.platformRevision, CANDIDATE)
  assert.equal(sample.task?.queueState, 'FINISHED', 'Only terminal original tasks may be transferred')
  assert.ok(sample.application?.id && sample.task?.id && Array.isArray(sample.versions) && Array.isArray(sample.files))
  assert.ok(sample.files.some(f => f.path === 'database.sql') && sample.files.some(f => f.path === 'schema.sql'))
  for (const f of sample.files) { assert.equal(safeMember(f.path), f.path); assert.match(f.sha256, /^sha256:[a-f0-9]{64}$/) }
}
export function requireSeparateOutput(output, inputs) {
  for (const source of inputs) {
    const tail = relative(resolve(source), resolve(output))
    assert.ok(tail === '..' || tail.startsWith('../') || tail.startsWith('..\\') || isAbsolute(tail), 'Bundle output must be outside all input trees')
  }
}
export function validateCoverage(originalIds, unexecuted) {
  assert.equal(new Set(originalIds).size, originalIds.length)
  for (const row of unexecuted) {
    assert.equal(row.reason, 'CNY_BUDGET_NOT_STARTED')
    assert.equal(row.jvmStarted, false); assert.equal(row.recordPresent, false)
  }
  const ids = [...originalIds, ...unexecuted.map(row => row.sampleId)]
  assert.equal(new Set(ids).size, IDS.length, 'Missing or overlapping original identities')
  assert.deepEqual([...ids].sort(), [...IDS].sort(), 'All fourteen original positions must remain explicit')
}
export function validateSupplement(summary, retained, batchId, unexecuted) {
  assert.equal(summary.sampleId, 'FAULT-ENV-02'); assert.equal(summary.kind, 'SEPARATE_FIRST_ACTUAL_JVM')
  assert.equal(summary.candidate, CANDIDATE); assert.equal(summary.originalBatchId, batchId)
  assert.equal(summary.originalBatchUnchanged, true); assert.equal(summary.originalBatchStillIncomplete, true)
  assert.equal(summary.retries, 0); assert.equal(summary.acceptedByB, null)
  assert.equal(summary.exitCode, 0); assert.equal(summary.timedOut, false); assert.equal(summary.recordPresent, true)
  assert.ok(unexecuted.some(row => row.sampleId === summary.sampleId && row.reason === 'CNY_BUDGET_NOT_STARTED'))
  validateRetained(retained, summary.sampleId, batchId)
}
function nativeTar(args) {
  const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => /^(?:PATH|SYSTEMROOT|WINDIR|TEMP|TMP|USERPROFILE|LANG)$/i.test(k)))
  const tar = process.platform === 'win32' ? join(process.env.SystemRoot ?? 'C:/Windows', 'System32/tar.exe') : 'tar'
  const r = spawnSync(tar, args, { env, windowsHide: true, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 })
  assert.equal(r.status, 0, 'Native archive command failed'); return r.stdout
}
function inventory(directory, secret, prefix = '') {
  const out = []
  for (const e of readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const path = join(directory, e.name), name = prefix + e.name, info = lstatSync(path)
    safeMember(name); assert.ok(!info.isSymbolicLink(), 'Linked handoff member rejected')
    if (info.isDirectory()) out.push(...inventory(path, secret, name + '/'))
    else {
      assert.ok(info.isFile(), 'Nonregular handoff member rejected')
      const b = readFileSync(path)
      if (secret) assert.equal(b.includes(Buffer.from(secret)), false, 'Model credential found; do not package')
      out.push({ path: name.replaceAll('\\', '/'), bytes: b.length, sha256: sha(b) })
    }
  }
  return out
}
function copyTree(source, target) {
  mkdirSync(target, { recursive: false })
  for (const e of readdirSync(source, { withFileTypes: true })) {
    const p = join(source, e.name), q = join(target, e.name)
    assert.ok(!lstatSync(p).isSymbolicLink())
    if (e.isDirectory()) copyTree(p, q)
    else { assert.ok(e.isFile()); copyFileSync(p, q) }
  }
}
export function packPrivateHandoff(batchPath, retainedPath, outputPath, supplement = null) {
  const batch = contained(root, batchPath), retained = contained(root, retainedPath), output = contained(root, outputPath)
  const batchInfo = json(join(batch, 'batch.json'))
  assert.equal(batchInfo.git.head, CANDIDATE); assert.equal(batchInfo.mode, 'REAL'); assert.deepEqual(batchInfo.samples.map(s => s.id), IDS)
  assert.ok(!existsSync(output), 'Never overwrite another private bundle')
  requireSeparateOutput(output, [batch, retained])
  const secret = process.env.CODELESS_MODEL_API_KEY; assert.ok(secret && secret.length >= 8, 'Exact existing credential required for exclusion scan')
  const original = [], unexecuted = []
  for (const id of IDS) {
    const dir = join(retained, id), manifest = join(dir, 'retained.json')
    if (!existsSync(manifest)) {
      // An original refusal is evidence, never an empty database or a fabricated successful task.
      const result = json(join(batch, 'samples', id, 'invocation-result.json'))
      assert.equal(result.launchError, 'CNY_BUDGET_NOT_STARTED'); assert.equal(result.exitCode, null)
      assert.equal(result.recordPresent, false); assert.equal(result.durationMs, 0)
      assert.equal(existsSync(join(batch, 'samples', id, 'record.json')), false)
      assert.equal(existsSync(dir), false, 'Unexpected partial retained state requires manual review')
      unexecuted.push({ sampleId: id, reason: result.launchError, jvmStarted: false, recordPresent: false })
      continue
    }
    const r = json(manifest); validateRetained(r, id, batchInfo.batchId)
    for (const file of r.files) assert.equal(sha(readFileSync(contained(dir, join(dir, file.path)))), file.sha256, id + ': original file changed')
    original.push({ sampleId: id, applicationId: r.application.id, taskId: r.task.id, status: r.task.status, versions: r.versions })
  }
  validateCoverage(original.map(row => row.sampleId), unexecuted)
  const supplements = [], extraInputs = []
  if (supplement) {
    const evidence = contained(root, supplement.evidencePath), extraRetained = contained(root, supplement.retainedPath)
    requireSeparateOutput(output, [evidence, extraRetained])
    const summary = json(join(evidence, 'summary.json')), saved = json(join(extraRetained, 'FAULT-ENV-02/retained.json'))
    validateSupplement(summary, saved, batchInfo.batchId, unexecuted)
    for (const file of saved.files) {
      const directory = join(extraRetained, 'FAULT-ENV-02')
      assert.equal(sha(readFileSync(contained(directory, join(directory, file.path)))), file.sha256)
    }
    assert.equal(sha(readFileSync(join(evidence, 'spec.json'))), sha(readFileSync(join(batch, 'samples/FAULT-ENV-02/spec.json'))))
    inventory(evidence, secret); inventory(extraRetained, secret)
    supplements.push({ sampleId: saved.sampleId, applicationId: saved.application.id, taskId: saved.task.id,
      versions: saved.versions, status: saved.task.status, acceptedByB: null, replacesOriginalRefusal: false,
      evidenceDirectory: 'supplement-evidence', retainedDirectory: 'supplement-retained' })
    extraInputs.push([evidence, 'supplement-evidence'], [extraRetained, 'supplement-retained'])
  }
  inventory(batch, secret); inventory(retained, secret)
  mkdirSync(output, { recursive: false }); const stage = join(output, 'plaintext-stage.private'); mkdirSync(stage)
  copyTree(batch, join(stage, 'batch')); copyTree(retained, join(stage, 'retained'))
  for (const [directory, name] of extraInputs) copyTree(directory, join(stage, name))
  const files = inventory(stage, secret)
  assert.ok(files.length <= 50000 && files.reduce((n, f) => n + f.bytes, 0) <= 512 * 1024 * 1024, 'Archive size outside bounded handoff scope')
  const manifest = { format: 'CodeLess private D25 handoff v1', batchId: batchInfo.batchId, platformCandidate: CANDIDATE,
    originalTasksOnly: true, original, unexecuted, supplements, originalBatchExecutionComplete: unexecuted.length === 0,
    qualityStatus: 'HOLD_PENDING_INDEPENDENT_ACCEPTANCE', files, modelCredentialExcluded: true, balanceSnapshotExcluded: true,
    userTransfersCiphertextAndKeySeparately: true, bPaidWorkAuthorized: false,
    restore: 'Clone the public repo; use exact fixed candidate. Restore original DB/version exports using the existing retained-runtime helper; supply your own approved model credential. Do not import SQL before checking this manifest. A loopback URL/session from the other device is not reusable.' }
  writeFileSync(join(stage, 'handoff.json'), JSON.stringify(manifest, null, 2) + '\n', { flag: 'wx', mode: 0o600 })
  const archive = join(output, 'originals.private.tar.gz')
  nativeTar(['-czf', archive, '-C', stage, '.'])
  const key = randomBytes(32), sealed = encryptPrivateBytes(readFileSync(archive), key)
  const encryptedFile = join(output, 'codeless-d25-originals.enc'), keyFile = join(output, 'handoff-key.private.json')
  writeFileSync(encryptedFile, sealed, { flag: 'wx', mode: 0o600 })
  writeFileSync(keyFile, JSON.stringify({ algorithm: 'AES-256-GCM', keyBase64: key.toString('base64'), transmitSeparately: true }, null, 2) + '\n', { flag: 'wx', mode: 0o600 })
  const receipt = { batchId: batchInfo.batchId, platformCandidate: CANDIDATE, encryptedFile, keyFile,
    encryptedSha256: encryptedDigest(sealed), encryptedBytes: sealed.length, originalSamples: original.length,
    supplementSamples: supplements.length, actualPositionsWithRetainedTask: original.length + supplements.length,
    expectedSamples: IDS.length, unexecuted, originalBatchExecutionComplete: unexecuted.length === 0,
    originalFiles: files.length, manifestSha256: sha(readFileSync(join(stage, 'handoff.json'))),
    modelCredentialExcluded: true, noUploadPerformed: true, originalInputsRetained: true }
  writeFileSync(join(output, 'transfer-receipt.json'), JSON.stringify(receipt, null, 2) + '\n', { flag: 'wx' })
  return receipt
}
export function unpackPrivateHandoff(encryptedPath, keyPath, outputPath) {
  const encrypted = contained(root, encryptedPath), keyFile = contained(root, keyPath), output = contained(root, outputPath)
  assert.ok(!existsSync(output), 'Never overwrite a runtime or previously extracted bundle')
  const key = Buffer.from(json(keyFile).keyBase64, 'base64'), plain = decryptPrivateBytes(readFileSync(encrypted), key)
  const archive = output + '.archive.private.tar.gz'
  writeFileSync(archive, plain, { flag: 'wx', mode: 0o600 })
  for (const line of nativeTar(['-tzf', archive]).split(/\r?\n/).filter(Boolean)) {
    const name = safeMember(line)
    assert.ok(!name || name === 'handoff.json' || ['batch', 'retained', 'supplement-evidence', 'supplement-retained'].some(r => name === r || name.startsWith(r + '/')), 'Unexpected archive root')
  }
  for (const line of nativeTar(['-tvzf', archive]).split(/\r?\n/).filter(Boolean)) assert.ok(/^[-d]/.test(line), 'Archive links or special files refused')
  mkdirSync(output); nativeTar(['-xzf', archive, '--no-same-owner', '-C', output])
  const m = json(join(output, 'handoff.json')); assert.equal(m.platformCandidate, CANDIDATE)
  validateCoverage(m.original.map(row => row.sampleId), m.unexecuted)
  assert.equal(m.originalBatchExecutionComplete, m.unexecuted.length === 0)
  for (const file of m.files) {
    assert.equal(safeMember(file.path), file.path)
    const path = contained(output, join(output, file.path)); assert.equal(sha(readFileSync(path)), file.sha256)
  }
  for (const row of m.original) validateRetained(json(join(output, 'retained', row.sampleId, 'retained.json')), row.sampleId, m.batchId)
  const supplements = m.supplements ?? [] // Earlier v1 packages explicitly contained only the original partial batch.
  assert.ok(Array.isArray(supplements) && supplements.length <= 1)
  for (const row of supplements) {
    assert.equal(row.evidenceDirectory, 'supplement-evidence'); assert.equal(row.retainedDirectory, 'supplement-retained')
    assert.equal(row.replacesOriginalRefusal, false); assert.equal(row.acceptedByB, null)
    validateSupplement(json(join(output, 'supplement-evidence/summary.json')),
      json(join(output, 'supplement-retained/FAULT-ENV-02/retained.json')), m.batchId, m.unexecuted)
  }
  return { batchId: m.batchId, platformCandidate: m.platformCandidate, output, filesVerified: m.files.length,
    samplesVerified: m.original.length, supplementSamplesVerified: supplements.length, unexecuted: m.unexecuted,
    originalBatchExecutionComplete: m.originalBatchExecutionComplete, modelCalls: 0 }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const [mode, a, b, c, d, e] = process.argv.slice(2)
    assert.ok(['pack', 'unpack'].includes(mode) && a && b && c, 'pack|unpack <batch-or-cipher> <retained-or-key> <new-private-output>')
    assert.ok(!d && !e || mode === 'pack' && d && e, 'Optional supplement requires both evidence and retained paths')
    console.log(JSON.stringify(mode === 'pack' ? packPrivateHandoff(a, b, c, d ? { evidencePath: d, retainedPath: e } : null) : unpackPrivateHandoff(a, b, c)))
  } catch (e) { console.error(e.message); process.exitCode = 1 }
}
