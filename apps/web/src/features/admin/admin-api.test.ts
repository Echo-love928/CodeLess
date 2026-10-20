import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { session, clearSession } from '../auth/session'
import { cancelTask, getMetrics, listRecords, successRate, checkAdmin, type Outcomes } from './admin-api'

const id = '11111111-1111-4111-8111-111111111111'
const filters = { ownerId: '', status: '', from: '', to: '' }
const counts: Outcomes = { succeeded: 0, failed: 0, pending: 0, cancelled: 0, unknown: 0 }
const metrics = () => ({ generation: { ...counts }, deployment: { ...counts }, usage: { inputTokens: null, outputTokens: null, unknownCalls: 1 }, trend: [] })
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
  respond({ items: [], page: 2, size: 10, total: 0 })
  await listRecords('tasks', { ownerId: id, status: 'FAILED', from: '2026-10-01T00:00:00Z', to: '2026-10-20T00:00:00Z' }, 2, 10)
  const url = new URL(vi.mocked(fetch).mock.calls[0]![0] as string, 'https://platform.test')
  expect(Object.fromEntries(url.searchParams)).toEqual({ ownerId: id, status: 'FAILED', from: '2026-10-01T00:00:00.000Z', to: '2026-10-20T00:00:00.000Z', page: '2', size: '10' })
})
it('refuses a mismatched page or corrupt usage instead of making it look empty', async () => {
  respond({ items: [], page: 0, size: 20, total: 0 })
  await expect(listRecords('tasks', filters, 1, 20)).rejects.toThrow('不符合约定')
  respond({ items: [{ id, createdAt: '2026-10-20T00:00:00Z', inputTokens: -1 }], page: 0, size: 20, total: 1 })
  await expect(listRecords('model-calls', filters, 0, 20)).rejects.toThrow('不符合约定')
})
it('keeps unknown status and null usage, including genuine measured zero', async () => {
  respond({ items: [{ id, createdAt: '2026-10-20T00:00:00Z', status: 'NEW_STATUS', inputTokens: null, outputTokens: 0 }], page: 0, size: 20, total: 1 })
  expect((await listRecords('model-calls', filters, 0, 20)).items[0]).toMatchObject({ status: 'NEW_STATUS', inputTokens: null, outputTokens: 0 })
  respond(metrics()); expect((await getMetrics(filters)).usage.inputTokens).toBeNull()
  expect(successRate(counts)).toBe('暂无已知终态')
  expect(successRate({ ...counts, unknown: 4, pending: 3 })).toBe('暂无已知终态')
  expect(successRate({ ...counts, succeeded: 1, failed: 3, unknown: 40, pending: 10 })).toBe('25.0%')
})
it('keeps generation and deployment denominators separate and omits table status from metrics', async () => {
  const value = metrics(); value.generation = { ...counts, succeeded: 3, failed: 1 }; value.deployment = { ...counts, succeeded: 1, failed: 3 }
  respond(value)
  const result = await getMetrics({ ...filters, status: 'READY' })
  expect(successRate(result.generation)).toBe('75.0%'); expect(successRate(result.deployment)).toBe('25.0%')
  expect(String(vi.mocked(fetch).mock.calls[0]![0])).not.toContain('status=')
})
it('rejects missing count/usage fields and unordered or impossible trend dates', async () => {
  respond({ ...metrics(), usage: { unknownCalls: 0 } }); await expect(getMetrics(filters)).rejects.toThrow('不符合约定')
  respond({ ...metrics(), trend: [{ day: '2026-02-30', generation: counts }] }); await expect(getMetrics(filters)).rejects.toThrow('不符合约定')
  respond({ ...metrics(), trend: [{ day: '2026-10-20', generation: counts }, { day: '2026-10-19', generation: counts }] }); await expect(getMetrics(filters)).rejects.toThrow('不符合约定')
})
it('does not send invalid time/owner filters', async () => {
  respond({})
  await expect(getMetrics({ ...filters, ownerId: '../secret' })).rejects.toThrow('UUID')
  await expect(getMetrics({ ...filters, from: '2026-10-20', to: '2026-10-19' })).rejects.toThrow('结束时间')
  expect(fetch).not.toHaveBeenCalled()
})
it('submits one exact cancellation target with CSRF and requires an audit receipt', async () => {
  respond({ taskId: id, status: 'REQUESTED', auditId: id })
  expect(await cancelTask(id, ' operator reason ')).toMatchObject({ taskId: id, status: 'REQUESTED' })
  expect(fetch).toHaveBeenCalledWith(`/api/v0/admin/tasks/${id}/cancel`, expect.objectContaining({ method: 'POST', headers: expect.objectContaining({ 'X-CSRF-Token': 'csrf' }), body: '{"reason":"operator reason"}' }))
  respond({ taskId: id, status: 'CANCELLED' }); await expect(cancelTask(id, 'reason')).rejects.toThrow('不符合约定')
  respond({ taskId: 'other', status: 'CANCELLED', auditId: id }); await expect(cancelTask(id, 'reason')).rejects.toThrow('不符合约定')
})
it('requires a CSRF token and reason, reports missing D17-A and preserves permission errors', async () => {
  respond({})
  await expect(cancelTask(id, ' ')).rejects.toThrow('理由')
  session.csrfToken = null; await expect(cancelTask(id, 'reason')).rejects.toMatchObject({ kind: 'unauthorized' }); expect(fetch).not.toHaveBeenCalled()
  respond({}, 404); await expect(getMetrics(filters)).rejects.toThrow('D17-A 待完成')
  respond({}, 403); await expect(getMetrics(filters)).rejects.toMatchObject({ kind: 'forbidden' })
})
