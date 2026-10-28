import assert from 'node:assert/strict';
export const budget = Object.freeze({currency: 'CNY', authorizedRmb: 2, maxAttempts: 8, maxInputTokenReservation: 33280, maxOutputTokens: 4096, peakInputRmbPerMillion: 2, peakOutputRmbPerMillion: 8});
export const reservationRmb = (input, output) => (input * budget.peakInputRmbPerMillion + output * budget.peakOutputRmbPerMillion) / 1e6;
export const qualifies = (report, command) => command.exitCode === 0 && !command.signal && report?.status === 'PASSED' && report?.assertions?.completed === true;
export function publicReport(raw, command, machine) {
  assert.ok(['REAL', 'MOCK'].includes(raw.mode));
  assert.ok(raw.calls.length <= budget.maxAttempts);
  const calls = raw.calls.map(c => {
    const evidence = c.reply?.evidence ?? c.evidence, usage = evidence?.usage;
    return {index: c.index, outcome: c.outcome ?? 'UNKNOWN', latencyMs: c.endNanos === undefined ? null : (c.endNanos - c.startNanos) / 1e6,
      inputReservation: c.inputByteReservation, maxOutputTokens: c.maxOutputTokens, timeoutMs: c.timeoutMs,
      actualModel: evidence?.actualModel ?? null, inputTokens: usage?.inputTokens ?? null, outputTokens: usage?.outputTokens ?? null, totalTokens: usage?.totalTokens ?? null};
  });
  let upperReservation = 0, knownUsageCostUpper = 0, unknownUsageCalls = 0;
  for (const c of calls) {
    assert.ok(Number.isInteger(c.inputReservation) && c.inputReservation <= budget.maxInputTokenReservation);
    assert.ok(Number.isInteger(c.maxOutputTokens) && c.maxOutputTokens <= budget.maxOutputTokens);
    if (c.outcome === 'MODEL_CAPACITY_EXCEEDED') continue; // production wrapper refuses before any transport call
    upperReservation += reservationRmb(c.inputReservation, c.maxOutputTokens);
    if (c.inputTokens === null || c.outputTokens === null) unknownUsageCalls++;
    else knownUsageCostUpper += reservationRmb(c.inputTokens, c.outputTokens);
  }
  assert.ok(upperReservation <= budget.authorizedRmb);
  const attempted = calls.length, rejected = calls.filter(c => c.outcome === 'MODEL_CAPACITY_EXCEEDED').length;
  const dispatched = raw.calls.filter(c => c.outcome !== 'MODEL_CAPACITY_EXCEEDED');
  const completed = dispatched.filter(c => c.endNanos !== undefined);
  const elapsed = completed.length ? (Math.max(...completed.map(c => c.endNanos)) - Math.min(...dispatched.map(c => c.startNanos))) / 1e9 : null;
  const reads = raw.http.map(r => ({status: r.status, latencyMs: r.latencyMs, overlapsOutstandingProvider: r.providerOutstandingAtStart && r.providerOutstandingAtEnd}));
  const timings = values => { const sorted = [...values].sort((a,b)=>a-b);return sorted.length ? {n: sorted.length, p50: sorted[Math.ceil(sorted.length*.5)-1], p95: sorted[Math.ceil(sorted.length*.95)-1], max: sorted.at(-1)} : {n: 0, p50: null, p95: null, max: null}; };
  return {schemaVersion: 1, mode: raw.mode, status: raw.status === 'PASSED' && command.exitCode === 0 && !command.signal ? 'PASSED' : 'FAILED',
    scope: 'One API JVM isolated candidate on deployment hardware; production provider + PLAN, manual task claims. Not complete-generation or multi-instance capacity.',
    configuredModel: raw.configuredModel, machine, configuration: raw.configuration, command: {exitCode: command.exitCode, signal: command.signal},
    budget, financial: {currency: 'CNY', reservedUpperRmb: upperReservation, knownUsageCostUpperRmb: raw.mode === 'REAL' ? knownUsageCostUpper : null,
      unknownUsageCalls, actualDebitedRmb: null, note: 'Peak cache-miss tariff estimate; unknown usage retains reservation. Not a provider invoice. MOCK is not paid usage.'},
    provider: {attempted, localRejections: rejected, rejectionRate: attempted ? rejected/attempted : null, dispatched: dispatched.length, completed: completed.length,
      returned: calls.filter(c=>c.outcome==='RETURNED').length, timeouts: calls.filter(c=>c.outcome==='MODEL_TIMEOUT').length,
      intervalSeconds: elapsed, completedInvocationsPerSecond: elapsed > 0 ? completed.length/elapsed : null, latencyMs: timings(calls.filter(c=>c.outcome!=='MODEL_CAPACITY_EXCEEDED'&&c.latencyMs!==null).map(c=>c.latencyMs)), calls},
    http: {samples: reads, latencyMs: timings(reads.map(r=>r.latencyMs)), overlapSamples: reads.filter(r=>r.overlapsOutstandingProvider).length},
    assertions: raw.assertions, failureClass: raw.failureClass ?? null, realModelQualityEvaluated: false, multiInstanceResult: 'NOT_EXECUTED'};
}
