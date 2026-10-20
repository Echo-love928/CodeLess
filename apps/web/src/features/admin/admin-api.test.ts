import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { wireMetrics, wireCancel } from '../../../../../tests/e2e/admin/wire-fixture'
import { session, clearSession } from '../auth/session'
import { CancellationRejected, cancelTask, getMetrics, getGenerationTrend, listRecords, successRate, checkAdmin, statusLabel, type Outcomes } from './admin-api'

const id = '11111111-1111-4111-8111-111111111111'
const filters = { ownerId: '', status: '', from: '', to: '' }
const counts: Outcomes = { succeeded: 0, failed: 0, pending: 0, cancelled: 0 }
const metrics = () => wireMetrics({ empty: true })
const respond = (body: unknown, status = 200) => vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status })))
beforeEach(() => { session.status = 'authenticated'; session.user = { id, role: 'ADMIN', displayName: 'Admin', email: 'admin@example.test' }; session.csrfToken = 'csrf' })
afterEach(() => { vi.unstubAllGlobals(); clearSession() })

it('denies ordinary and expired sessions before reading management data', async () => {
  respond({})
  session.user!.role = 'USER'
  await expect(listRecords('tasks', filters, 0, 20)).rejects.toMatchObject({ kind: 'forbidden' })
  clearSession()
  await expect(getMetrics(filters)).rejects.toMatchObject({ kind: 'unauthorized' })
  expect(fetch).not.toHaveBeenCalled()
})
it('checks server role and current account rather than accepting a cached ADMIN', async () => {
  respond({ id, role: 'USER' }); expect(await checkAdmin()).toBe(false)
  respond({ id: 'different-account', role: 'ADMIN' }); expect(await checkAdmin()).toBe(false)
  respond({ id, role: 'ADMIN' }); expect(await checkAdmin()).toBe(true)
})
it('passes filtering and zero-based pagination to the server without filtering a local page', async () => {
  respond({ items: [], page: 2, size: 10, totalItems: 0, totalPages: 0 })
  await listRecords('tasks', { ownerId: id, status: 'FAILED', from: '2026-10-01T00:00:00Z', to: '2026-10-20T00:00:00Z' }, 2, 10)
  const url = new URL(vi.mocked(fetch).mock.calls[0]![0] as string, 'https://platform.test')
  expect(Object.fromEntries(url.searchParams)).toEqual({ ownerId: id, status: 'FAILED', from: '2026-10-01T00:00:00.000Z', to: '2026-10-20T00:00:00.000Z', page: '2', size: '10' })
})
it('refuses a mismatched page or corrupt usage instead of making it look empty', async () => {
  respond({ items: [], page: 0, size: 20, totalItems: 0, totalPages: 0 })
  await expect(listRecords('tasks', filters, 1, 20)).rejects.toThrow('不符合约定')
  respond({ items: [{ id, createdAt: '2026-10-20T00:00:00Z', inputTokens: -1 }], page: 0, size: 20, totalItems: 1, totalPages: 1 })
  await expect(listRecords('model-calls', filters, 0, 20)).rejects.toThrow('不符合约定')
})
it('keeps unknown status and null usage, including genuine measured zero', async () => {
  respond({ items: [{ id, createdAt: '2026-10-20T00:00:00Z', status: 'NEW_STATUS', inputTokens: null, outputTokens: 0 }], page: 0, size: 20, totalItems: 1, totalPages: 1 })
  expect((await listRecords('model-calls', filters, 0, 20)).items[0]).toMatchObject({ status: 'NEW_STATUS', inputTokens: null, outputTokens: 0 })
  respond(metrics()); expect((await getMetrics(filters)).usage.inputTokens).toBeNull()
  expect(successRate(counts)).toBe('暂无已知终态')
  expect(successRate({ ...counts, pending: 3 })).toBe('暂无已知终态')
  expect(successRate({ ...counts, succeeded: 1, failed: 3, pending: 10 })).toBe('25.0%')
})
it('keeps generation and deployment denominators separate and omits table status from metrics', async () => {
  const value = metrics(); value.generation = wireMetrics().generation; value.deployment = wireMetrics().deployment
  respond(value)
  const result = await getMetrics({ ...filters, status: 'READY' })
  expect(successRate(result.generation)).toBe('75.0%'); expect(successRate(result.deployment)).toBe('25.0%')
  expect(String(vi.mocked(fetch).mock.calls[0]![0])).not.toContain('status=')
})
it.each([[57, 800, 0.0713], [113, 800, 0.1413], [3, 4, 0.75]])(
  'accepts backend rounding for %i/%i in both generation and deployment', async (succeeded, denominator, rate) => {
    const value = metrics()
    value.generation = { ...value.generation, total: denominator, ready: succeeded, failed: denominator - succeeded, denominator, successRate: rate }
    value.deployment = { ...value.deployment, total: denominator, published: succeeded, failed: denominator - succeeded, denominator, successRate: rate }
    respond(value)
    await expect(getMetrics(filters)).resolves.toMatchObject({ generation: { rate, denominator }, deployment: { rate, denominator } })
  },
)
it('accepts backend rounding when loading a daily trend window', async () => {
  const value = metrics()
  const range = { from: '2026-10-19T00:00:00.000Z', to: '2026-10-20T00:00:00.000Z' }
  value.window = { ...range, field: 'createdAt' }
  value.generation = { ...value.generation, total: 800, ready: 57, failed: 743, denominator: 800, successRate: 0.0713 }
  respond(value)
  await expect(getGenerationTrend({ ...filters, ...range })).resolves.toEqual([
    expect.objectContaining({ day: '2026-10-19', generation: expect.objectContaining({ rate: 0.0713 }) }),
  ])
})
it.each(['generation', 'deployment'] as const)('still rejects an incorrect rounded rate in %s', async key => {
  const value = metrics()
  if (key === 'generation') value.generation = { ...value.generation, total: 800, ready: 57, failed: 743, denominator: 800, successRate: 0.0712 }
  else value.deployment = { ...value.deployment, total: 800, published: 57, failed: 743, denominator: 800, successRate: 0.0712 }
  respond(value)
  await expect(getMetrics(filters)).rejects.toThrow('不符合约定')
})
it('rejects missing usage, false precise totals and inconsistent backend denominators', async () => {
  respond({ ...metrics(), tokens: { unknownCalls: 0 } }); await expect(getMetrics(filters)).rejects.toThrow('不符合约定')
  const partial = metrics(); partial.tokens.totalTokens = 0; respond(partial); await expect(getMetrics(filters)).rejects.toThrow('不符合约定')
  const wrong = metrics(); wrong.generation.denominator = 1; respond(wrong); await expect(getMetrics(filters)).rejects.toThrow('不符合约定')
})
it('does not send invalid time/owner filters', async () => {
  respond({})
  await expect(listRecords('tasks', { ...filters, ownerId: '../secret' }, 0, 20)).rejects.toThrow('UUID')
  await expect(getMetrics({ ...filters, from: '2026-10-20', to: '2026-10-19' })).rejects.toThrow('结束时间')
  expect(fetch).not.toHaveBeenCalled()
})
it('submits one exact cancellation target with CSRF and requires an audit receipt', async () => {
  respond(wireCancel(id, id, id))
  expect(await cancelTask(id, ' operator reason ')).toMatchObject({ task: { id, failureCode: 'CANCELLED' }, audit: { id, outcome: 'CANCELLED' } })
  expect(fetch).toHaveBeenCalledWith(`/api/v0/admin/tasks/${id}/cancel`, expect.objectContaining({ method: 'POST', headers: expect.objectContaining({ 'X-CSRF-Token': 'csrf' }), body: '{"reason":"operator reason"}' }))
  respond({ taskId: id, status: 'CANCELLED' }); await expect(cancelTask(id, 'reason')).rejects.toThrow('不符合约定')
  respond({ taskId: 'other', status: 'CANCELLED', auditId: id }); await expect(cancelTask(id, 'reason')).rejects.toThrow('不符合约定')
})
it('requires a CSRF token and reason, reports missing D17-A and preserves permission errors', async () => {
  respond({})
  await expect(cancelTask(id, ' ')).rejects.toThrow('理由')
  session.csrfToken = null; await expect(cancelTask(id, 'reason')).rejects.toMatchObject({ kind: 'unauthorized' }); expect(fetch).not.toHaveBeenCalled()
  respond({}, 404); await expect(getMetrics(filters)).rejects.toThrow('目标不存在')
  respond({}, 403); await expect(getMetrics(filters)).rejects.toMatchObject({ kind: 'forbidden' })
})

it('matches the audit actor and target, and preserves a committed task with UNKNOWN audit completion', async () => {
  respond(wireCancel(id, '22222222-2222-4222-8222-222222222222', id))
  await expect(cancelTask(id, 'reason')).rejects.toThrow('不符合约定')
  respond(wireCancel(id, id, id, 'UNKNOWN'))
  expect((await cancelTask(id, 'reason')).audit.outcome).toBe('UNKNOWN')
  const wrong = wireCancel(id, id, id); wrong.audit.resultingStatus = 'READY'; respond(wrong)
  await expect(cancelTask(id, 'reason')).rejects.toThrow('不符合约定')
})
it.each([[400, 'INVALID_REQUEST'], [404, 'NOT_FOUND'], [503, 'ADMIN_AUDIT_UNAVAILABLE']])(
  'identifies a definite cancellation rejection (%i, %s)', async (status, code) => {
    respond({ code }, status as number)
    await expect(cancelTask(id, 'reason')).rejects.toBeInstanceOf(CancellationRejected)
  },
)
it('does not treat a generic proxy 503, a network error or a malformed receipt as proof of no cancellation', async () => {
  respond({ code: 'UNAVAILABLE' }, 503)
  await expect(cancelTask(id, 'reason')).rejects.toMatchObject({ kind: 'server', status: 503 })
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('connection lost')))
  await expect(cancelTask(id, 'reason')).rejects.toMatchObject({ kind: 'network' })
  respond({ task: {} })
  await expect(cancelTask(id, 'reason')).rejects.toThrow('不符合约定')
})
it('labels a missing audit target without inventing an unknown outcome', () => {
  expect(statusLabel('NOT_FOUND')).toBe('目标不存在 · NOT_FOUND')
})
