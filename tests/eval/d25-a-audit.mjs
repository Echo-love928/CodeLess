// Audit only this task's committed/staged delta, never enumerate unrelated untracked work.
import { spawnSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { root, canonical, sha256 } from '../../scripts/eval/lib.mjs'
const base = '5de2e6cf995c95ee91a1f9dc40403654df0af3de'
const output = process.argv[2]
const git = (...args) => {
  const result = spawnSync('git', ['-c', 'safe.directory=' + root.replaceAll('\\', '/').replace(/\/$/, ''), ...args], { cwd: root, windowsHide: true, encoding: 'utf8' })
  if (result.status !== 0) throw Error('git audit command failed')
  return result.stdout.trim()
}
const head = git('rev-parse', 'HEAD')
const paths = [...new Set([git('diff', '--name-only', base + '...HEAD'), git('diff', '--cached', '--name-only')].join('\n').split('\n').filter(Boolean))].sort()
const deleted = new Set(git('diff', '--diff-filter=D', '--name-only', base + '...HEAD').split('\n').filter(Boolean))
for (const path of git('diff', '--cached', '--diff-filter=D', '--name-only').split('\n').filter(Boolean)) deleted.add(path)
const allowed = path => path.startsWith('scripts/eval/') || path.startsWith('evals/results/') || path.startsWith('tests/eval/') || ['docs/evaluation-final.md', 'docs/handoffs/D25-A.md'].includes(path)
const outsideScope = paths.filter(path => !allowed(path))
const forbidden = paths.filter(path => /(?:^|\/)(?:\.private|\.env|session\.private\.json)(?:\/|$)|\.sql(?:\.gz)?$/.test(path))
const secret = process.env.CODELESS_MODEL_API_KEY
if (!secret || secret.length < 8) throw Error('Exact existing model credential required for the audit; value is never printed')
let exactOccurrences = 0, totalBytes = 0
const findings = [], files = []
const outputRelative = relative(root, output).replaceAll('\\', '/')
for (const path of paths) {
  if (deleted.has(path) || path === outputRelative) continue
  const bytes = readFileSync(join(root, path)); totalBytes += bytes.length
  exactOccurrences += bytes.toString('latin1').split(secret).length - 1
  // Existing explicit fixture marker is public synthetic test data, not a credential.
  const text = bytes.toString('utf8').replaceAll('sk-d21-synthetic-credential-0123456789', '<synthetic-fixture>')
  for (const [name, regex] of [['provider-or-github-token', /(?:sk-|gh[pousr]_|github_pat_)[A-Za-z0-9_-]{20,}/g],
    ['bearer-value', /Bearer [A-Za-z0-9_-]{24,}/g], ['private-key', /-----BEGIN (?:RSA |OPENSSH |EC )?PRIVATE KEY-----/g]]) {
    const count = [...text.matchAll(regex)].length
    if (count) findings.push({ path, pattern: name, count })
  }
  files.push({ path, bytes: bytes.length, sha256: sha256(bytes) })
}
const result = { task: 'D25-A', base, head, branch: git('branch', '--show-current'),
  scope: 'committed delta plus staged delta; unrelated untracked files and this output excluded',
  outsideScope, forbidden, exactCredentialOccurrences: exactOccurrences, secretPatternFindings: findings,
  scannedFiles: files.length, totalBytes, files, passed: !outsideScope.length && !forbidden.length && exactOccurrences === 0 && !findings.length }
writeFileSync(output, canonical(result), { flag: 'wx' })
console.log(JSON.stringify({ output, passed: result.passed, outsideScope, forbidden, exactCredentialOccurrences: exactOccurrences, findings, scannedFiles: files.length, totalBytes }))
process.exitCode = result.passed ? 0 : 1
