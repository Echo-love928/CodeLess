// Reproduce the two failed code-fault samples from their actual private replies; no model requests.
import assert from 'node:assert/strict'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { validateActions } from '../../services/runner/src/verify/actions.mjs'
import { sha256, canonical } from '../../scripts/eval/lib.mjs'
const [batchPrivateRoot, output] = process.argv.slice(2)
mkdirSync(output, { recursive: true })
const code02 = ['04-result.json', '05-result.json'].map(file => {
  const bytes = readFileSync(join(batchPrivateRoot, 'FAULT-CODE-02-wire', file)), result = JSON.parse(bytes)
  const proposal = JSON.parse(result.replyContent)
  assert.throws(() => validateActions(proposal.actions), /invalid action text/)
  return { file, wireResultSha256: sha256(bytes), replySha256: sha256(result.replyContent), actions: proposal.actions,
    observed: 'invalid action text', rejected: true }
})
const bytes = readFileSync(join(batchPrivateRoot, 'FAULT-CODE-03-wire/04-result.json')), invalid = JSON.parse(bytes)
assert.throws(() => JSON.parse(invalid.replyContent), SyntaxError)
if (process.env.CODELESS_MODEL_API_KEY && invalid.replyContent.includes(process.env.CODELESS_MODEL_API_KEY)) throw Error('credential found; do not publish')
writeFileSync(join(output, 'FAULT-CODE-03-reply.txt'), invalid.replyContent, { flag: 'wx' })
const result = { task: 'D25-A', batchId: '2026-10-29T10-12-17Z-real-4e8e6f51', additionalModelRequests: 0,
  code02: { sampleId: 'FAULT-CODE-02', expected: 'original proposals remain rejected', cases: code02 },
  code03: { sampleId: 'FAULT-CODE-03', wireResultSha256: sha256(bytes), replySha256: sha256(invalid.replyContent),
    rawReply: 'FAULT-CODE-03-reply.txt', replyBytes: Buffer.byteLength(invalid.replyContent),
    jsonSyntaxRejected: true, usage: invalid.evidence.usage, causeBeyondInvalidSyntax: 'UNKNOWN' } }
writeFileSync(join(output, 'fault-replay.json'), canonical(result), { flag: 'wx' })
console.log(JSON.stringify({ code02ProposalsRejected: code02.length, code03SyntaxRejected: true, additionalModelRequests: 0 }))
