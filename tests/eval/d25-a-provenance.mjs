// Read-only provenance across the upstream squash/rebase; original batch SHA is never rewritten.
import { spawnSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { root, sha256, canonical, loadFrozen } from '../../scripts/eval/lib.mjs'
const original = 'a863b76e9d5785e20cb6f0d43bb67f79f5df0a50'
const git = (...args) => {
  const result = spawnSync('git', ['-c', 'safe.directory=' + root.replaceAll('\\', '/').replace(/\/$/, ''), ...args], { cwd: root, windowsHide: true })
  if (result.status !== 0) throw Error('git failed: ' + args[0])
  return result.stdout
}
const head = git('rev-parse', 'HEAD').toString().trim()
const scopes = ['services/api/src', 'services/api/pom.xml', 'services/api/agent-runner.mjs', 'services/runner/src', 'prompts', 'templates', 'infra/runner', 'infra/build-image', 'package.json', 'pnpm-lock.yaml']
const batch = JSON.parse(readFileSync(join(root, 'evals/results/generation/runs/2026-10-29T10-12-17Z-real-4e8e6f51/batch.json')))
const command = JSON.parse(readFileSync(join(root, 'evals/results/D25-A/commands/2026-10-29T10-12-16.688Z-real/command.json')))
const runtimeChanges = git('diff', '--name-only', original, head, '--', ...scopes).toString().trim().split('\n').filter(Boolean)
const runtimeSourceBytes = Object.entries(command.sourceDigests).filter(([path]) => scopes.some(scope => path === scope || path.startsWith(scope + '/')))
  .map(([path, measuredSha256]) => ({ path, measuredSha256, currentSha256: sha256(readFileSync(join(root, path))) }))
const result = { schemaVersion: 2, task: 'D25-A', evaluatedCommit: original, inspectedCommit: head,
  fullGateCommit: '311a96f6e30972e88ff9d0ed49702c534a25ea52', upstreamMain: '5de2e6cf995c95ee91a1f9dc40403654df0af3de',
  originalCommitRetainedAs: 'codex/d25-a-evaluated-a863b76',
  scopes, runtimeChanges, runtimeGitContentIdentical: runtimeChanges.length === 0,
  measuredRuntimeBytesIdentical: runtimeSourceBytes.every(row => row.measuredSha256 === row.currentSha256), runtimeSourceBytes,
  batchDriverGitBlobs: Object.entries(batch.code).map(([path, measuredSha256]) => ({ path, measuredSha256, currentSha256: sha256(git('cat-file', 'blob', head + ':' + path)) })),
  frozen: Object.fromEntries(Object.entries(loadFrozen()).map(([name, file]) => [name, { current: file.sha256, evaluated: batch.frozen[name].sha256, same: file.sha256 === batch.frozen[name].sha256 }])),
  upstreamUiChanges: git('diff', '--name-only', original, head, '--', 'apps/web/src').toString().trim().split('\n').filter(Boolean),
  note: 'Original REAL batch ran before synchronization. Main adds the reviewed PreviewPanel fix; final ci-gate runs after synchronization. Runtime source equality does not relabel original execution as a run on the new SHA.' }
writeFileSync(process.argv[2], canonical(result), { flag: 'wx' })
console.log(JSON.stringify({ head, runtimeChanges, runtimeGitContentIdentical: result.runtimeGitContentIdentical, measuredRuntimeBytesIdentical: result.measuredRuntimeBytesIdentical, originalDriverBlobsIdentical: result.batchDriverGitBlobs.every(row => row.currentSha256 === row.measuredSha256) }))
process.exitCode = result.runtimeGitContentIdentical && result.measuredRuntimeBytesIdentical ? 0 : 1
