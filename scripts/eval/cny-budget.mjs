// Batch-external financial guard. Does not alter the frozen platform, prompts, runtime limits or model transport.
import assert from 'node:assert/strict'

export const PRICE = Object.freeze({
  currency: 'CNY', model: 'deepseek-flash', inputMissPerMillion: 2, outputPerMillion: 8,
  source: 'https://api-docs.deepseek.com/zh-cn/quick_start/pricing/', checkedOn: '2026-10-30',
  policy: 'Peak rates, all input treated as cache miss; no cache/off-peak discount assumed',
})
const NANOS = 1_000_000_000n
const INPUT_NANOS = 2000n, OUTPUT_NANOS = 8000n
export const TASK_TOKEN_CAP = 50000
export const TASK_RESERVATION = BigInt(TASK_TOKEN_CAP) * OUTPUT_NANOS

export function cnyToNanos(value) {
  assert.match(String(value), /^\d+(?:\.\d{1,9})?$/, 'CNY must be a nonnegative decimal with at most 9 decimal places')
  const [whole, fraction = ''] = String(value).split('.')
  return BigInt(whole) * NANOS + BigInt(fraction.padEnd(9, '0'))
}
export function nanosToCny(value) {
  assert.equal(typeof value, 'bigint'); assert.ok(value >= 0n)
  const fraction = (value % NANOS).toString().padStart(9, '0').replace(/0+$/, '')
  return (value / NANOS).toString() + (fraction ? '.' + fraction : '')
}
const count = n => Number.isSafeInteger(n) && n >= 0
const uncertain = reason => ({ upperNanos: TASK_RESERVATION, actualCny: null,
  usage: 'UNKNOWN', basis: 'FULL_50000_TOKEN_TASK_AT_MAX_PEAK_RATE', reason })

/** Costs FAILED calls too. Missing/incomplete evidence holds the entire task reservation, never zero. */
export function sampleExposure(record) {
  if (!record || record.mode !== 'REAL') return uncertain('RECORD_MISSING_OR_NOT_REAL')
  if (!Object.hasOwn(record, 'harnessError') || record.harnessError !== null) return uncertain('HARNESS_INCOMPLETE')
  if (!Array.isArray(record.modelCalls) || !Array.isArray(record.journal)) return uncertain('CALLS_OR_JOURNAL_MISSING')
  const requests = record.journal.filter(e => e.kind === 'model.request').length
  if (requests !== record.modelCalls.length || requests > 12) return uncertain('CALL_COUNT_MISMATCH')
  let inputTokens = 0, outputTokens = 0, excessTokens = 0
  for (const call of record.modelCalls) {
    if (call.provider !== 'deepseek' || call.model !== PRICE.model) return uncertain('PROVIDER_OR_MODEL_MISMATCH')
    if (!['SUCCEEDED', 'FAILED'].includes(call.status)) return uncertain('CALL_NOT_FINISHED')
    if (!count(call.inputTokens) || !count(call.outputTokens)) return uncertain('USAGE_INCOMPLETE')
    if (call.totalTokens != null && (!count(call.totalTokens) || call.totalTokens < call.inputTokens + call.outputTokens))
      return uncertain('USAGE_INCONSISTENT')
    inputTokens += call.inputTokens; outputTokens += call.outputTokens
    excessTokens += call.totalTokens == null ? 0 : call.totalTokens - call.inputTokens - call.outputTokens
  }
  if (inputTokens + outputTokens + excessTokens > TASK_TOKEN_CAP) throw Error('FINANCIAL_BOUND_BROKEN: observed tokens exceed frozen runtime cap')
  const upperNanos = BigInt(inputTokens) * INPUT_NANOS + BigInt(outputTokens + excessTokens) * OUTPUT_NANOS
  assert.ok(upperNanos <= TASK_RESERVATION)
  return { upperNanos, actualCny: null, usage: 'KNOWN_TOKENS', basis: 'PEAK_CACHE_MISS_UPPER_BOUND_NOT_ACTUAL_BILL',
    inputTokens, outputTokens, excessTokens, calls: record.modelCalls.length }
}

export class CnyBatchBudget {
  constructor(limit = '2') {
    this.limit = cnyToNanos(limit); assert.ok(this.limit > 0n && this.limit <= cnyToNanos('2'), 'User-authorized maximum is CNY 2')
    this.exposure = 0n; this.entries = []; this.active = null
  }
  begin(sampleId) {
    assert.equal(this.active, null, 'Only one sample may be active')
    assert.ok(!this.entries.some(e => e.sampleId === sampleId), 'Never retry a started or denied sample')
    if (this.exposure + TASK_RESERVATION > this.limit) {
      this.entries.push({ sampleId, status: 'BUDGET_NOT_STARTED', launched: false, reservationCny: '0', reason: 'INSUFFICIENT_FOR_WHOLE_TASK_BOUND' })
      return false
    }
    this.active = sampleId; this.exposure += TASK_RESERVATION
    this.entries.push({ sampleId, status: 'RESERVED_UNKNOWN_OUTCOME', launched: true,
      reservationCny: nanosToCny(TASK_RESERVATION), upperCny: nanosToCny(TASK_RESERVATION), actualCny: null })
    return true
  }
  settle(sampleId, record) {
    assert.equal(this.active, sampleId)
    const receipt = sampleExposure(record), entry = this.entries.find(e => e.sampleId === sampleId)
    this.exposure = this.exposure - TASK_RESERVATION + receipt.upperNanos
    Object.assign(entry, { ...receipt, upperNanos: undefined, upperCny: nanosToCny(receipt.upperNanos),
      releasedCny: nanosToCny(TASK_RESERVATION - receipt.upperNanos), status: 'SETTLED', actualCny: null })
    this.active = null; assert.ok(this.exposure <= this.limit)
    return entry
  }
  snapshot() {
    return { currency: 'CNY', authorizedCapCny: nanosToCny(this.limit), reservedOrSettledUpperCny: nanosToCny(this.exposure),
      remainingCny: nanosToCny(this.limit - this.exposure), actualCny: null, active: this.active,
      maxOneTaskCny: nanosToCny(TASK_RESERVATION), price: PRICE,
      note: 'Financial upper bounds only. UNKNOWN token usage is retained. An interrupted active task keeps its whole reservation.',
      entries: structuredClone(this.entries) }
  }
}
