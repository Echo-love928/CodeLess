// Temporary D17-A review repro (not committed). Backend values come from AdminQueries.ratio:
// Math.round(n * 10000.0 / d) / 10000.0  ->  57/800 = 0.0713 (jshell), B's client computes 0.0712.
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { session, clearSession } from '../auth/session'
import { getMetrics } from './admin-api'

const id = '11111111-1111-4111-8111-111111111111'
const filters = { ownerId: '', status: '', from: '', to: '' }
const body = (ready: number, failed: number, successRate: number) => ({
  window: { from: null, to: null, field: 'createdAt' },
  generation: { total: ready + failed, ready, failed, cancelled: 0, active: 0, denominator: ready + failed, successRate,
    byKind: { GENERATION: { total: ready + failed, ready, failed, cancelled: 0, active: 0, denominator: ready + failed, successRate },
      EDIT: { total: 0, ready: 0, failed: 0, cancelled: 0, active: 0, denominator: 0, successRate: null } } },
  deployment: { total: 0, published: 0, failed: 0, inProgress: 0, denominator: 0, successRate: null },
  repairs: { total: 0, tasksWithRepairs: 0, readyAfterRepair: 0, denominator: ready + failed, averagePerTask: 0 },
  tokens: { calls: 0, knownCalls: 0, unknownCalls: 0, pendingCalls: 0, inputTokens: 0, outputTokens: 0, totalTokens: 0,
    knownInputTokens: 0, knownOutputTokens: 0, knownTotalTokens: 0, complete: true },
  generatedAt: '2026-10-20T08:00:00Z' })
beforeEach(() => { session.status = 'authenticated'; session.user = { id, role: 'ADMIN', displayName: 'Admin', email: 'admin@example.test' }; session.csrfToken = 'csrf' })
afterEach(() => { vi.unstubAllGlobals(); clearSession() })
const respond = (value: unknown) => vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(value), { status: 200 })))

it('control: 3/4 = 0.75 is accepted', async () => {
  respond(body(3, 1, 0.75)); await expect(getMetrics(filters)).resolves.toMatchObject({ generation: { rate: 0.75 } })
})
it('repro: the backend value for 57/800 (0.0713) must be accepted', async () => {
  respond(body(57, 743, 0.0713)); await expect(getMetrics(filters)).resolves.toMatchObject({ generation: { rate: 0.0713 } })
})
