// Inspect B's published evidence relationships; this does not reproduce B's private platform execution.
import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { canonical, sha256 } from '../../scripts/eval/lib.mjs'
const [directory, output] = process.argv.slice(2)
const bytes = readFileSync(join(directory, 'docs/evidence/D25-B/full-product.json')), report = JSON.parse(bytes)
assert.equal(report.mode, 'MOCK'); assert.equal(report.status, 'PASSED'); assert.equal(report.publicAcceptance, false)
assert.equal(report.browserExitCode, 0); assert.equal(report.retries, 0); assert.deepEqual(report.cleanupErrors, [])
assert.equal(report.actors.length, 2)
for (const [index, actor] of report.actors.entries()) {
  const exported = report.exports['user-' + (index + 1) + '-export']
  assert.equal(actor.app, exported.manifest.applicationId); assert.equal(actor.edited, exported.manifest.versionId)
  assert.equal(actor.publication.versionId, actor.edited); assert.equal(actor.publication.applicationId, actor.app)
  assert.equal(actor.publication.status, 'PUBLISHED')
  assert.equal(exported.status, 'PASSED'); assert.deepEqual(exported.failures, [])
  for (const key of ['sourceDigest', 'contentDigest', 'templateDigest']) assert.equal(exported.manifest[key], exported.recomputed[key])
}
assert.ok(report.crossUser.length === 2 && report.crossUser.every(row => row.denied.length === 8 && row.denied.every(item => item.status === 404)))
assert.equal(report.wrongVersion.stale, 409); assert.equal(report.wrongVersion.mismatchedArtifact, 409)
assert.equal(report.failurePreservesVersion.latestReadyVersionId, report.actors[0].edited)
assert.notEqual(report.failurePreservesVersion.failedVersionId, report.failurePreservesVersion.latestReadyVersionId)
assert.equal(report.failurePreservesVersion.wrongDownloadBlocked, true)
assert.equal(report.failurePreservesVersion.historicalVersionId, report.exports['historical-export'].manifest.versionId)
const result = { task: 'D25-A', reviewedCommit: 'bd6188ffef5cb1d2ab5d05a14d94f5e8e71a58ac', evidenceDigest: sha256(bytes),
  mode: 'MOCK', status: 'STRUCTURAL_RELATIONSHIPS_CHECKED', actors: 2, crossUserDenied: 16, exports: 3,
  staleAndArtifactMismatchRejected: true, failurePreservesVersion: true, publicAcceptance: false,
  limitation: 'Checks B supplied report fields, not private logs, ZIP bytes, online real-model edits or public hosting.' }
writeFileSync(output, canonical(result), { flag: 'wx' })
console.log(JSON.stringify(result))
