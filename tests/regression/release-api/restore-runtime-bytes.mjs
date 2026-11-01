// Restore only the two reviewed Windows checkout EOL differences, never unknown prompt edits.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { spawnSync } from 'node:child_process'
import assert from 'node:assert/strict'
import { digest } from './freeze-bytes.mjs'
const root = resolve(import.meta.dirname, '../../..')
assert.ok(process.argv.length === 2 || (process.argv.length === 3 && process.argv[2] === '--write'))
const write = process.argv[2] === '--write'
const frozen = JSON.parse(readFileSync(join(import.meta.dirname, 'release-freeze.json')))
const reference = '6ceeb5a7e822f058e5b84ee96f15eac952e87fda'
const plan = ['prompts/runtime/generate-v1.txt', 'prompts/runtime/repair-v1.txt'].map(path => {
  const r = spawnSync('git', ['-c', `safe.directory=${root.replaceAll('\\','/')}`, 'show', `${reference}:${path}`], { cwd: root })
  assert.equal(r.status, 0, 'Pinned PR88 reference required')
  assert.equal(digest(r.stdout), frozen.files[path], `Reference bytes must match the original raw freeze: ${path}`)
  const current = readFileSync(join(root, path)), actual = digest(current)
  const exact = actual === frozen.files[path]
  const crlf = digest(Buffer.from(r.stdout.toString('utf8').replaceAll('\n', '\r\n')))
  assert.ok(exact || actual === crlf, `Unknown prompt content: preserve and review ${path}; no restore performed`)
  return { path, current, original: r.stdout, actual, expected: frozen.files[path], exact }
}) // Preflight both files before any write.
const results = []
for (const p of plan) {
  let backup = null
  if (write && !p.exact) {
    backup = `.local-data/d26-a/followup/prompt-checkout-backups/${p.actual.slice(7)}.raw`
    mkdirSync(resolve(root, '.local-data/d26-a/followup/prompt-checkout-backups'), { recursive: true })
    writeFileSync(join(root, backup), p.current)
    writeFileSync(join(root, p.path), p.original)
    assert.equal(digest(readFileSync(join(root, p.path))), p.expected)
  }
  results.push({ path: p.path, before: p.actual, expected: p.expected, action: p.exact ? 'ALREADY_EXACT' : write ? 'RESTORED_EXACT_FROZEN_BYTES' : 'REVIEWED_EOL_RESTORE_AVAILABLE', backup })
}
console.log(JSON.stringify({ reference, write, runtimePromptChanges: [], results }))
