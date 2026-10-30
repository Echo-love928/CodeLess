// Bind a new REAL command to its immutable candidate and retain original failed evidence unchanged.
// Usage: node tests/eval/d25-a-followup-provenance.mjs <batch> <real-command.json> <output.json>
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { root, sha256, canonical, loadFrozen } from '../../scripts/eval/lib.mjs'
const [batchDirectory, commandFile, output] = process.argv.slice(2)
const git = (...args) => {
  const r = spawnSync('git', ['-c', 'safe.directory=' + root.replaceAll('\\', '/').replace(/\/$/, ''), ...args], { cwd: root, windowsHide: true })
  assert.equal(r.status, 0, 'git ' + args[0]); return r.stdout
}
const batch = JSON.parse(readFileSync(join(batchDirectory, 'batch.json')))
const command = JSON.parse(readFileSync(commandFile))
assert.equal(batch.mode, 'REAL'); assert.equal(batch.git.head, command.head)
assert.equal(command.headUnchanged, true); assert.equal(command.sourceBytesUnchanged, true)
const head = git('rev-parse', 'HEAD').toString().trim()
const sources = Object.entries(command.sourceDigests).map(([path, executedSha256]) => ({ path, executedSha256, currentSha256: sha256(readFileSync(join(root, path))) }))
const frozen = Object.fromEntries(Object.entries(loadFrozen()).map(([key, file]) => [key, { executed: batch.frozen[key].sha256, current: file.sha256, same: batch.frozen[key].sha256 === file.sha256 }]))
const originalDirectory = 'evals/results/generation/runs/2026-10-29T10-12-17Z-real-4e8e6f51'
const paths = git('ls-tree', '-r', '--name-only', '9ad40a0', '--', originalDirectory).toString().trim().split('\n')
const original = paths.map(path => ({ path, same: git('show', '9ad40a0:' + path).equals(readFileSync(join(root, path))) }))
const result = { task: 'D25-A', batchId: batch.batchId, evaluatedCommit: batch.git.head, inspectedCommit: head,
  commandFile, headUnchangedDuringExecution: command.headUnchanged, sourceBytesUnchangedDuringExecution: command.sourceBytesUnchanged,
  currentSourceBytesMatchExecution: sources.every(row => row.executedSha256 === row.currentSha256), sources, frozen,
  originalFailedBatch: { commit: '9ad40a0ee05cac7091de7520592eb764f3e46342', directory: originalDirectory, files: original.length, unchanged: original.every(row => row.same), changed: original.filter(row => !row.same) },
  productionChangesFromPreviousCandidate: git('diff', '--name-only', '9ad40a0', head, '--', 'prompts', 'services/api/src', 'services/runner/src', 'contracts', 'package.json', 'pnpm-lock.yaml', '.github').toString().trim().split('\n').filter(Boolean) }
writeFileSync(output, canonical(result), { flag: 'wx' }); console.log(JSON.stringify({ evaluatedCommit: result.evaluatedCommit, inspectedCommit: head, sourceBytesMatch: result.currentSourceBytesMatchExecution, originalUnchanged: result.originalFailedBatch.unchanged }))
process.exitCode = result.currentSourceBytesMatchExecution && result.originalFailedBatch.unchanged && Object.values(frozen).every(row => row.same) ? 0 : 1
