// Named contract test fixture. Live integration tests never import this module.
export const zero = () => ({ total: 0, ready: 0, failed: 0, cancelled: 0, active: 0, denominator: 0, successRate: null as number | null })
export function wireMetrics(options: { empty?: boolean; from?: string | null; to?: string | null } = {}) {
  return {
    window: { from: options.from ?? null, to: options.to ?? null, field: 'createdAt' }, generatedAt: '2026-10-20T04:00:00Z',
    generation: { ...zero(), ...(options.empty ? {} : { total: 4, ready: 3, failed: 1, denominator: 4, successRate: 0.75 }), byKind: {} },
    deployment: options.empty ? { total: 0, published: 0, failed: 0, inProgress: 0, denominator: 0, successRate: null as number | null }
      : { total: 4, published: 1, failed: 3, inProgress: 0, denominator: 4, successRate: 0.25 as number | null },
    repairs: { total: 0, tasksWithRepairs: 0, readyAfterRepair: 0, denominator: options.empty ? 0 : 4, averagePerTask: options.empty ? null : 0 },
    tokens: { calls: 2, knownCalls: 0, unknownCalls: 2, pendingCalls: 0, inputTokens: null as number | null, outputTokens: null as number | null, totalTokens: null as number | null, knownInputTokens: 0, knownOutputTokens: 0, knownTotalTokens: 0, complete: false },
  }
}
export function wireCancel(id: string, actorId: string, auditId: string, outcome = 'CANCELLED') {
  return { task: { id, createdAt: '2026-10-20T04:00:00Z', status: 'FAILED', failureCode: 'CANCELLED', cancellable: false },
    audit: { id: auditId, action: 'TASK_CANCEL', actorId, targetType: 'TASK', targetId: id, reason: 'fixture reason', requestedAt: '2026-10-20T04:00:00Z',
      outcome, previousStatus: 'GENERATE', resultingStatus: 'FAILED', completedAt: outcome === 'UNKNOWN' ? null : '2026-10-20T04:00:01Z' } }
}
