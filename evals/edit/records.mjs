import assert from 'node:assert/strict'
import { lstat, readFile, mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { sha, safeFile } from '../browser/core.mjs'
import { validateManifest } from '../../services/runner/src/mapping/manifest.mjs'
import { edits } from './cases.mjs'

export const uuid = value => typeof value === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(value)
const sourcePath = value => /^src\/(?:pages|components)\/[A-Za-z][A-Za-z0-9_-]*\.vue$|^src\/data\/[A-Za-z][A-Za-z0-9_-]*\.ts$/.test(value)

export function snapshotSource(value) {
  const { version, snapshot, files } = value
  assert.ok(uuid(version.id) && uuid(version.applicationId))
  assert.equal(snapshot.versionId, version.id); assert.equal(snapshot.sourceDigest, version.sourceDigest)
  assert.equal(snapshot.status, version.status)
  assert.ok(Array.isArray(files) && files.length > 0 && files.length <= 40)
  const paths = new Set(), manifest = files.map(file => {
    assert.ok(typeof file.path === 'string' && sourcePath(file.path) && !paths.has(file.path.toLowerCase()))
    assert.ok(!/^(?:CON|PRN|AUX|NUL|CONIN|CONOUT|COM[0-9]+|LPT[0-9]+)$/i.test(file.path.split('/').at(-1).replace(/\.(?:vue|ts)$/, '')))
    paths.add(file.path.toLowerCase())
    assert.equal(file.versionId, version.id); assert.equal(file.sourceDigest, version.sourceDigest)
    assert.equal(typeof file.content, 'string')
    const bytes = Buffer.byteLength(file.content)
    assert.ok(bytes <= 131072); assert.equal(bytes, file.bytes); assert.equal(sha(file.content), file.digest)
    return { path: file.path, bytes, digest: file.digest }
  }).sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0)
  assert.ok(manifest.reduce((n, f) => n + f.bytes, 0) <= 524288)
  assert.deepEqual(snapshot.files, manifest); assert.equal(sha(JSON.stringify(manifest)), version.sourceDigest)
  return manifest
}

function verified(value) {
  assert.equal(value.version.status, 'VERIFIED')
  const validation = value.snapshot.validation, report = validation?.report
  assert.equal(validation?.status, 'VERIFIED'); assert.equal(validation.sourceDigest, value.version.sourceDigest)
  assert.equal(report.status, 'VERIFIED'); assert.equal(report.sourceDigest, value.version.sourceDigest)
  assert.equal(report.buildId, value.version.buildId); assert.ok(uuid(report.buildId) && uuid(report.verificationId))
  assert.equal(report.buildStatus, 'SUCCEEDED'); assert.equal(report.exitCode, 0)
  assert.equal(report.verificationStatus, 'PASSED'); assert.equal(report.failureCode, null)
  assert.equal(validation.artifactDigest, report.artifactDigest)
  assert.equal(sha(JSON.stringify(validation.artifact.files)), validation.artifactDigest)
  assert.equal(validation.artifact.digest, validation.artifactDigest)
}

export function validateEditRecord(record, edit, base, batch, trustedMapping) {
  assert.equal(record.schemaVersion, 1); assert.equal(record.sampleId, edit.id)
  assert.equal(record.batchId, batch.batchId); assert.equal(record.mode, batch.mode)
  assert.equal(record.collection.kind, 'PLATFORM_API')
  assert.ok(base?.record && base.version, 'No verified generation base')
  const { task, source, baseVersionId } = record.edit
  assert.ok(uuid(task.id) && task.id !== base.record.task.id)
  assert.equal(task.applicationId, base.record.task.applicationId)
  assert.equal(task.prompt, edit.prompt); assert.ok(['READY', 'FAILED'].includes(task.status), 'Edit task is not terminal')
  assert.equal(baseVersionId, base.version.id); assert.equal(record.before.version.id, baseVersionId)
  assert.equal(record.before.version.taskId, base.record.task.id)
  assert.equal(record.before.version.applicationId, task.applicationId)
  assert.equal(record.before.version.sourceDigest, base.version.sourceDigest)
  const before = snapshotSource(record.before); verified(record.before)
  validateManifest(record.before.mapping, trustedMapping)
  const mapping = trustedMapping.components.find(c => c.componentId === edit.componentId && c.sourceFile === edit.file)
  assert.ok(mapping, 'Target is not selectable in the rebuilt trusted mapping')
  assert.equal(mapping.fileDigest, before.find(f => f.path === edit.file)?.digest)
  assert.equal(source.type, 'COMPONENT'); assert.equal(source.componentId, edit.componentId)
  assert.equal(source.versionId, baseVersionId); assert.equal(source.sourceDigest, base.version.sourceDigest)
  assert.equal(source.sourceFile, edit.file)
  // REAL provenance comes from the captured task-specific audit, not a mode label.
  const audit = record.modelCalls
  assert.equal(audit.page, 0); assert.equal(audit.size, 100)
  assert.ok(audit.items.length > 0 && audit.items.length <= 12)
  assert.equal(audit.totalItems, audit.items.length); assert.equal(audit.totalPages, 1)
  const calls = new Set()
  for (const call of audit.items) {
    assert.ok(uuid(call.id) && !calls.has(call.id)); calls.add(call.id)
    assert.equal(call.taskId, task.id); assert.equal(call.applicationId, task.applicationId)
    assert.equal(call.provider, batch.provider.id)
    if (batch.mode === 'REAL') assert.equal(call.model, batch.provider.model)
    assert.ok(['PLAN', 'GENERATE', 'REPAIR'].includes(call.stage))
    assert.ok(['REQUESTED', 'SUCCEEDED', 'FAILED'].includes(call.status))
    assert.ok(['KNOWN', 'UNKNOWN', 'PENDING'].includes(call.usage))
    assert.equal(call.status === 'REQUESTED', call.usage === 'PENDING')
    if (call.usage === 'KNOWN') {
      assert.ok(Number.isSafeInteger(call.inputTokens) && call.inputTokens >= 0)
      assert.ok(Number.isSafeInteger(call.outputTokens) && call.outputTokens >= 0)
      assert.equal(call.totalTokens, call.inputTokens + call.outputTokens)
    } else {
      for (const key of ['inputTokens', 'outputTokens']) assert.ok(call[key] === null || (Number.isSafeInteger(call[key]) && call[key] >= 0))
      assert.equal(call.totalTokens, null)
    }
  }
  let after = null
  if (task.status === 'READY') {
    assert.ok(record.after, 'READY edit lacks its immutable version')
    assert.ok(record.after.version.id !== baseVersionId)
    assert.equal(record.after.version.taskId, task.id); assert.equal(record.after.version.applicationId, task.applicationId)
    assert.ok(record.after.version.number > record.before.version.number)
    after = snapshotSource(record.after); verified(record.after)
  } else if (record.after) {
    assert.equal(record.after.version.taskId, task.id); assert.equal(record.after.version.applicationId, task.applicationId)
    assert.equal(record.after.version.status, 'FAILED'); snapshotSource(record.after)
  }
  const known = audit.items.filter(c => c.usage === 'KNOWN'), complete = known.length === audit.items.length
  return { task, before, after, mapping, usage: { calls: audit.items.length, knownCalls: known.length,
    unknownCalls: audit.items.length - known.length, knownTotalTokens: known.reduce((n, c) => n + c.totalTokens, 0),
    totalTokens: complete ? known.reduce((n, c) => n + c.totalTokens, 0) : null } }
}

export function editBlocker(edit, base, mapping) {
  if (!base) return { failure: 'BASE_RECORD_MISSING', blockedBy: edit.base }
  if (base.platform !== 'READY') return { failure: 'BASE_GENERATION_FAILED', blockedBy: edit.base, baseFailureCode: base.platformFailureCode ?? null }
  if (base.build?.status !== 'SUCCEEDED') return { failure: 'BASE_REPLAY_FAILED', blockedBy: edit.base }
  const file = mapping?.components.find(c => c.sourceFile === edit.file)
  if (!file || file.componentId !== edit.componentId) return { failure: 'COMPONENT_MAPPING_UNAVAILABLE', blockedBy: edit.base,
    mappingReason: mapping?.disabled.find(c => c.sourceFile === edit.file)?.reason ?? (file ? 'COMPONENT_ID_MISMATCH' : 'TARGET_FILE_UNMAPPED') }
  return { failure: 'EDIT_TASK_RECORD_REQUIRED', blockedBy: null }
}

export async function loadEditRecords(directory, batch) {
  if (!directory) return new Map()
  const bytes = await readFile(await safeFile(directory, 'index.json'))
  assert.ok(bytes.length <= 16384)
  const index = JSON.parse(bytes)
  assert.equal(index.schemaVersion, 1); assert.equal(index.batchId, batch.batchId); assert.equal(index.mode, batch.mode)
  assert.ok(Array.isArray(index.records) && index.records.length <= 6)
  const records = new Map(), tasks = new Set(), calls = new Set()
  for (const item of index.records) {
    assert.ok(edits.some(e => e.id === item.sampleId) && !records.has(item.sampleId))
    const file = await safeFile(directory, item.sampleId + '.json')
    assert.ok((await lstat(file)).size <= 3145728)
    const raw = await readFile(file); assert.equal(sha(raw), item.digest)
    const record = JSON.parse(raw); assert.equal(record.sampleId, item.sampleId)
    assert.ok(uuid(record.edit?.task?.id) && !tasks.has(record.edit.task.id)); tasks.add(record.edit.task.id)
    assert.ok(Array.isArray(record.modelCalls?.items))
    for (const call of record.modelCalls.items) { assert.ok(uuid(call.id) && !calls.has(call.id)); calls.add(call.id) }
    records.set(item.sampleId, { record, digest: item.digest })
  }
  return records
}

export async function writeCandidate(directory, record) {
  snapshotSource(record.after)
  for (const file of record.after.files) {
    const path = join(directory, file.path)
    await mkdir(join(path, '..'), { recursive: true })
    await writeFile(path, file.content, { flag: 'wx' })
  }
}
