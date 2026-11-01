// High-confidence public-source credential audit. Never print matched secret bytes.
import { spawnSync } from 'node:child_process'
import { writeFile } from 'node:fs/promises'
import assert from 'node:assert/strict'
const [commit, output] = process.argv.slice(2)
assert.match(commit, /^[a-f0-9]{40}$/)
const rules = {
  privateKey: '-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----',
  providerToken: '(sk-[A-Za-z0-9_-]{32,}|gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,})',
  reviewerPassword: '(reviewer|review|评审)[A-Za-z_ -]*(password|密码)["\x27 ]*[:=]["\x27 ]*[^"\x27 $<{][^"\x27 ]{7,}'
}
const findings = [], testFixtures = []
for (const [rule, pattern] of Object.entries(rules)) {
  const result = spawnSync('git', ['grep', '-I', '-l', '-E', '-e', pattern, commit, '--', '.', ':!tests', ':!evals', ':!docs/evidence', ':!docs/deployment/evidence'], { encoding: 'utf8', windowsHide: true })
  if (![0, 1].includes(result.status) || result.error || result.signal) throw new Error('Audit command failed')
  for (const entry of result.stdout.trim().split('\n').filter(Boolean)) {
    const path = entry.slice(commit.length + 1)
    const record = { rule, path }
    if (path.includes('/src/test/')) testFixtures.push(record)
    else findings.push(record)
  }
}
const report = { task: 'D27-B-T4', commit, status: findings.length ? 'REVIEW_REQUIRED' : 'PASSED',
  scope: 'Git-tracked release/product/document text; high-confidence token/private-key/reviewer-password literals',
  excluded: ['test fixtures', 'eval fixtures', 'historical evidence'],
  limitation: 'Pattern scan cannot identify all real passwords. Reviewer credentials remain server-only; no private credential was fetched or copied.',
  findings, testFixtures, secretsPrinted: false }
await writeFile(output, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' })
console.log(JSON.stringify(report))
if (findings.length) process.exitCode = 1
