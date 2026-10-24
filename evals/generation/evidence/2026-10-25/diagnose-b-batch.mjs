// D24-A: content-free diagnosis of B's main real batch from its published raw ZIP (no model calls).
// Usage: node diagnose-b-batch.mjs <extracted-zip-root> <zip-file> > out.json
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'

const [root, zip] = process.argv.slice(2)
const BATCH = '2026-10-24T13-47-29Z-real-103b5585'
const dir = path.join(root, 'evals/generation/runs', BATCH, 'samples')
const sha = (bytes) => 'sha256:' + crypto.createHash('sha256').update(bytes).digest('hex')
const TOKENS = 50000, OUTPUT = 4096, FRAMING = 512, MIN_OUTPUT = 256, CALLS = 12

const samples = []
for (const id of fs.readdirSync(dir).sort()) {
  const bytes = fs.readFileSync(path.join(dir, id, 'record.json'))
  const r = JSON.parse(bytes)
  const j = r.journal
  let charged = 0
  const calls = []
  let last = null
  for (const e of j) {
    const p = e.payload ?? {}
    if (e.kind === 'model.request') last = { stage: e.stage, reservedTokens: p.reservedTokens, chargedBefore: charged }
    if (e.kind === 'model.input' && last) { last.inputBytes = p.inputBytes; last.policyBytes = p.policyBytes }
    if (e.kind === 'model.response' && last) last.reply = p.type ?? (p.pages ? 'PLAN' : 'OTHER')
    if (e.kind === 'model.response' && last && p.type === 'tool') last.tool = p.name
    if (e.kind === 'model.usage' && last) {
      charged += p.chargedTokens ?? 0
      last.inputTokens = p.usage?.inputTokens ?? null
      last.outputTokens = p.usage?.outputTokens ?? null
      last.chargedTokens = p.chargedTokens
      calls.push(last); last = null
    }
  }
  const failure = j.filter((e) => e.kind === 'failure').at(-1)?.payload ?? null
  const repairFailures = j.filter((e) => e.kind === 'repair.failure').map((e) => ({
    code: e.payload.code, category: e.payload.category, decision: e.payload.decision, repairAttempts: e.payload.repairAttempts }))
  const runner = j.filter((e) => e.kind === 'runner.result').map((e) => ({
    build: e.payload.build?.status ?? null, buildFailure: e.payload.build?.failure ?? null,
    verification: e.payload.verification?.status ?? null, verificationFailure: e.payload.verification?.failure ?? null,
    visibleContent: e.payload.verification?.diagnostics?.visibleContent ?? null,
    pageErrors: e.payload.verification?.diagnostics?.pageErrors?.length ?? null,
    consoleErrors: e.payload.verification?.diagnostics?.consoleErrors?.length ?? null,
    blockedOrFailedRequests: e.payload.verification?.diagnostics ? (e.payload.verification.diagnostics.blockedRequests.length + e.payload.verification.diagnostics.failedRequests.length) : null,
    locatorWait: /^locator\.(?:click|fill|selectOption|check|waitFor): Timeout/.test(e.payload.verification?.error ?? '') }))
  const reads = calls.filter((c) => c.stage === 'GENERATE' && c.tool === 'files.read').length
  const out = {
    sampleId: id, recordSha256: sha(bytes), taskId: r.task?.id, status: r.task?.status, failureCode: r.task?.failureCode,
    repairAttempts: r.task?.repairAttempts, models: calls.length, chargedTokens: charged,
    generateReadBacks: reads, repairFailures, runner,
  }
  if (failure?.code === 'AGENT_MODEL_BUDGET_EXCEEDED') {
    const prev = calls.at(-1)
    const inputBound = prev.reservedTokens - OUTPUT
    const room = TOKENS - charged - inputBound
    out.budget = {
      refusedBefore: calls.length >= CALLS ? 'MODEL_CALLS' : 'TOKEN_RESERVATION',
      chargedAtRefusal: charged, remainingAtRefusal: TOKENS - charged,
      lastRecordedRequest: { stage: prev.stage, inputBound, reservedTokens: prev.reservedTokens, inputTokens: prev.inputTokens,
        inputTokensPerReservedInputByte: prev.inputTokens != null ? Number((prev.inputTokens / inputBound).toFixed(3)) : null },
      // A proxy, not a measurement: the refused request's own input was never recorded. It is at least as
      // large as the previous request's, so this is an upper bound on what the old rule could have admitted.
      proxy: 'PREVIOUS_REQUEST_INPUT_BOUND',
      oldRuleNeeded: inputBound + OUTPUT, newRuleOutputAllowanceAtPreviousSize: room >= MIN_OUTPUT ? Math.min(OUTPUT, room) : null,
    }
  }
  if (failure) out.failure = { code: failure.code, category: failure.category, stage: j.filter((e) => e.kind === 'failure').at(-1).stage }
  samples.push(out)
}
console.log(JSON.stringify({
  schemaVersion: 1, task: 'D24-A', kind: 'DIAGNOSIS_OF_PUBLISHED_RECORDS', modelCalls: 0,
  source: { pr: 'Echo-love928/CodeLess#65', file: 'evals/browser/evidence/real-acceptance-2026-10-24-raw.zip', zipSha256: sha(fs.readFileSync(zip)), batchId: BATCH },
  rules: { tokens: TOKENS, outputTokens: OUTPUT, framingTokens: FRAMING, minOutputTokens: MIN_OUTPUT, modelCalls: CALLS },
  samples,
}, null, 2))
