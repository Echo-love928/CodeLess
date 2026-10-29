// Reproduce the actual TASK-02 invalid proposals without executing or rewriting them.
import assert from 'node:assert/strict'
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { validateActions } from '../../services/runner/src/verify/actions.mjs'
import { sha256, canonical } from '../../scripts/eval/lib.mjs'
const [wireDirectory, output] = process.argv.slice(2)
const expected = ['unexpected action fields', 'invalid action text']
const cases = ['04-result.json', '05-result.json'].map((file, index) => {
  const bytes = readFileSync(join(wireDirectory, file))
  const result = JSON.parse(bytes), proposal = JSON.parse(result.replyContent)
  let error = null
  try { validateActions(proposal.actions) } catch (failure) { error = failure.message }
  assert.equal(error, expected[index])
  return { file, wireResultSha256: sha256(bytes), replySha256: sha256(result.replyContent),
    type: proposal.type, actions: proposal.actions, expected: expected[index], observed: error, rejected: true }
})
mkdirSync(join(output, '..'), { recursive: true })
writeFileSync(output, canonical({ task: 'D25-A', sampleId: 'TASK-02', batchId: '2026-10-29T10-12-17Z-real-4e8e6f51',
  mode: 'REAL_REPLY_OFFLINE_CONTRACT_REPLAY', additionalModelRequests: 0, cases,
  conclusion: 'Both actual done proposals remain rejected; original failed task is not changed into READY.' }), { flag: 'wx' })
console.log(JSON.stringify({ output, rejected: cases.length, additionalModelRequests: 0 }))
