import { ApiError, requestJson } from '../../api/http'
import type { AuthUser } from '../../api/auth'
import { session } from '../auth/session'

// D17-B integration proposal, NOT an existing D17-A contract. See docs/admin-usage.md.
// No fallback data: absent endpoints and incompatible payloads remain visible errors.
export const resources = ['tasks', 'applications', 'deployments', 'users', 'model-calls'] as const
export type Resource = typeof resources[number]
export interface Filters { status: string; ownerId: string; from: string; to: string }
export interface AdminRecord {
  id: string; createdAt: string; status?: string | null; ownerId?: string | null
  applicationId?: string | null; versionId?: string | null; taskId?: string | null
  name?: string | null; email?: string | null; role?: string | null; model?: string | null
  inputTokens?: number | null; outputTokens?: number | null; failureCode?: string | null
  cancellable?: boolean
}
export interface RecordPage { items: AdminRecord[]; page: number; size: number; total: number }
export interface Outcomes { succeeded: number; failed: number; pending: number; cancelled: number; unknown: number }
export interface Metrics {
  generation: Outcomes; deployment: Outcomes
  usage: { inputTokens: number | null; outputTokens: number | null; unknownCalls: number }
  trend: { day: string; generation: Outcomes }[]
}
export interface Cancellation { taskId: string; status: 'REQUESTED' | 'CANCELLED'; auditId: string }
const base = '/api/v0/admin'
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const count = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value)
const timestamp = (value: unknown): value is string => typeof value === 'string' && /^\d{4}-\d\d-\d\dT.*(?:Z|[+-]\d\d:\d\d)$/.test(value) && Number.isFinite(Date.parse(value))
function invalid(): never { throw new Error('管理接口响应不符合约定，请联系维护者核对；未将异常数据计为成功。') }
function requireAdmin() {
  if (session.status !== 'authenticated') throw new ApiError('unauthorized', 401)
  if (session.user?.role !== 'ADMIN') throw new ApiError('forbidden', 403)
}
async function read(path: string, init?: RequestInit): Promise<unknown> {
  requireAdmin()
  try { return await requestJson<unknown>(base + path, { ...init, cache: 'no-store', signal: AbortSignal.timeout(15_000) }) }
  catch (error) {
    if (error instanceof ApiError && [404, 405, 501].includes(error.status ?? 0)) throw new Error('管理数据接口尚未接入（D17-A 待完成）。')
    throw error
  }
}
export async function checkAdmin(): Promise<boolean> {
  requireAdmin()
  const user = await requestJson<AuthUser>(base + '/session', { cache: 'no-store', signal: AbortSignal.timeout(15_000) })
  return user?.role === 'ADMIN' && user.id === session.user?.id
}
export function query(filters: Filters, includeStatus = true) {
  const params = new URLSearchParams()
  if (filters.ownerId) {
    if (!uuid.test(filters.ownerId)) throw new Error('所有者 ID 必须为 UUID。')
    params.set('ownerId', filters.ownerId)
  }
  for (const key of ['from', 'to'] as const) {
    if (filters[key]) {
      const date = new Date(filters[key])
      if (!Number.isFinite(date.valueOf())) throw new Error('请输入有效的时间范围。')
      params.set(key, date.toISOString())
    }
  }
  if (filters.from && filters.to && Date.parse(filters.from) >= Date.parse(filters.to)) throw new Error('结束时间必须晚于开始时间。')
  if (includeStatus && filters.status) params.set('status', filters.status)
  return params
}
export async function listRecords(resource: Resource, filters: Filters, page: number, size: number): Promise<RecordPage> {
  if (!resources.includes(resource) || !count(page) || ![10, 20, 50].includes(size)) invalid()
  const params = query(filters); params.set('page', String(page)); params.set('size', String(size))
  const result = await read(`/${resource}?${params}`)
  if (!object(result) || result.page !== page || result.size !== size || !count(result.total) || !Array.isArray(result.items)
      || result.items.length > size || result.items.length > result.total || (result.items.length && page * size + result.items.length > result.total)) invalid()
  const ids = new Set<string>()
  for (const row of result.items) {
    if (!object(row) || typeof row.id !== 'string' || !uuid.test(row.id) || ids.has(row.id) || !timestamp(row.createdAt)) invalid()
    ids.add(row.id)
    for (const key of ['status', 'ownerId', 'applicationId', 'versionId', 'taskId', 'name', 'email', 'role', 'model', 'failureCode']) {
      if (row[key] !== undefined && row[key] !== null && (typeof row[key] !== 'string' || row[key].length > 1000)) invalid()
    }
    for (const key of ['inputTokens', 'outputTokens']) if (row[key] !== undefined && row[key] !== null && !count(row[key])) invalid()
    if (row.cancellable !== undefined && typeof row.cancellable !== 'boolean') invalid()
  }
  return result as unknown as RecordPage
}
function outcomes(value: unknown): value is Outcomes {
  return object(value) && ['succeeded', 'failed', 'pending', 'cancelled', 'unknown'].every(key => count(value[key]))
}
export async function getMetrics(filters: Filters): Promise<Metrics> {
  const result = await read(`/metrics?${query(filters, false)}`)
  if (!object(result) || !outcomes(result.generation) || !outcomes(result.deployment) || !object(result.usage)
      || !count(result.usage.unknownCalls) || !Array.isArray(result.trend) || result.trend.length > 366) invalid()
  for (const key of ['inputTokens', 'outputTokens']) if (result.usage[key] !== null && !count(result.usage[key])) invalid()
  let previous = ''
  for (const item of result.trend) {
    if (!object(item) || typeof item.day !== 'string' || !/^\d{4}-\d\d-\d\d$/.test(item.day)
        || !Number.isFinite(Date.parse(item.day)) || new Date(item.day).toISOString().slice(0, 10) !== item.day || item.day <= previous || !outcomes(item.generation)) invalid()
    previous = item.day
  }
  return result as unknown as Metrics
}
export async function cancelTask(taskId: string, reason: string): Promise<Cancellation> {
  requireAdmin()
  if (!uuid.test(taskId) || !reason.trim() || reason.trim().length > 500) throw new Error('取消需要明确的任务和 1–500 字理由。')
  if (!session.csrfToken) throw new ApiError('unauthorized', 401)
  const result = await read(`/tasks/${encodeURIComponent(taskId)}/cancel`, { method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': session.csrfToken }, body: JSON.stringify({ reason: reason.trim() }) })
  if (!object(result) || result.taskId !== taskId || !['REQUESTED', 'CANCELLED'].includes(String(result.status)) || typeof result.auditId !== 'string' || !uuid.test(result.auditId)) invalid()
  return result as unknown as Cancellation
}
export function successRate(value: Outcomes) {
  const terminal = value.succeeded + value.failed
  return terminal ? `${(value.succeeded / terminal * 100).toFixed(1)}%` : '暂无已知终态'
}
export const cancellable = (row: AdminRecord) => row.cancellable === true && ['PLAN', 'GENERATE', 'VERIFY', 'REPAIR'].includes(row.status ?? '')
export function statusLabel(status?: string | null) {
  const labels: Record<string, string> = { READY: '成功', PUBLISHED: '成功', SUCCEEDED: '成功', FAILED: '失败',
    PLAN: '计划中', GENERATE: '生成中', VERIFY: '验证中', REPAIR: '修复中', REQUESTED: '等待处理',
    ACTIVE: '启用', ARCHIVED: '归档', CANCELLED: '已取消', USER: '普通用户', ADMIN: '管理员' }
  return status && labels[status] ? `${labels[status]} · ${status}` : `未知${status ? ` · ${status}` : ''}`
}
