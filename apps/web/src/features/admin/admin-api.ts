import { ApiError, requestJson } from '../../api/http'
import type { AuthUser } from '../../api/auth'
import { session } from '../auth/session'

// Wire DTOs and filters follow contracts/admin, D17-A@f563db2. Normalization is UI-only.
export const resources = ['tasks', 'applications', 'deployments', 'users', 'model-calls', 'audit'] as const
export type Resource = typeof resources[number]
export interface Filters { status: string; ownerId: string; from: string; to: string; outcome?: string; usage?: string; q?: string; targetId?: string }
export interface AdminRecord {
  id: string; createdAt: string; status?: string | null; ownerId?: string | null
  applicationId?: string | null; versionId?: string | null; taskId?: string | null
  name?: string | null; email?: string | null; role?: string | null; model?: string | null
  inputTokens?: number | null; outputTokens?: number | null; failureCode?: string | null
  cancellable?: boolean
  requestedBy?: string | null; usage?: string | null; actorId?: string; targetId?: string; reason?: string; outcome?: string
}
export interface RecordPage { items: AdminRecord[]; page: number; size: number; total: number }
export interface Outcomes { succeeded: number; failed: number; pending: number; cancelled: number; rate?: number | null; denominator?: number }
export interface Metrics {
  generation: Outcomes; deployment: Outcomes
  usage: { inputTokens: number | null; outputTokens: number | null; unknownCalls: number; pendingCalls?: number; knownTotalTokens?: number }
  trend: { day: string; generation: Outcomes }[]
  repairs?: { total: number; tasksWithRepairs: number; readyAfterRepair: number }
}
export interface Audit { id: string; actorId: string; targetId: string; targetType: 'TASK'; action: 'TASK_CANCEL'; reason: string; outcome: 'CANCELLED' | 'ALREADY_TERMINAL' | 'NOT_FOUND' | 'FAILED' | 'UNKNOWN'; requestedAt: string; previousStatus: string | null; resultingStatus: string | null; completedAt: string | null }
export interface Cancellation { task: AdminRecord; audit: Audit }
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
    if (error instanceof ApiError && error.status === 404) throw new Error('目标不存在或管理接口版本不匹配，请刷新核对。')
    if (error instanceof ApiError && error.status === 503) throw new Error('管理服务或审计账本不可用，请联系维护者核对。')
    throw error
  }
}
export async function checkAdmin(): Promise<boolean> {
  requireAdmin()
  const user = await requestJson<AuthUser>(base + '/session', { cache: 'no-store', signal: AbortSignal.timeout(15_000) })
  return user?.role === 'ADMIN' && user.id === session.user?.id
}
export function query(filters: Filters, includeStatus = true, resource: Resource = 'tasks') {
  const params = new URLSearchParams()
  if (includeStatus && ['tasks', 'applications'].includes(resource) && filters.ownerId) {
    if (!uuid.test(filters.ownerId)) throw new Error('所有者 ID 必须为 UUID。')
    params.set('ownerId', filters.ownerId)
  }
  for (const key of ['from', 'to'] as const) {
    if ((!includeStatus || ['tasks', 'deployments', 'model-calls'].includes(resource)) && filters[key]) {
      const date = new Date(filters[key])
      if (!Number.isFinite(date.valueOf())) throw new Error('请输入有效的时间范围。')
      params.set(key, date.toISOString())
    }
  }
  if (filters.from && filters.to && Date.parse(filters.from) >= Date.parse(filters.to)) throw new Error('结束时间必须晚于开始时间。')
  if (includeStatus && filters.status) params.set(resource === 'audit' ? 'outcome' : 'status', filters.status)
  if (includeStatus && resource === 'tasks' && filters.outcome) params.set('outcome', filters.outcome)
  if (includeStatus && resource === 'model-calls' && filters.usage) params.set('usage', filters.usage)
  if (includeStatus && resource === 'users' && filters.q?.trim()) params.set('q', filters.q.trim())
  if (includeStatus && resource === 'audit' && filters.targetId) {
    if (!uuid.test(filters.targetId)) throw new Error('审计目标 ID 必须为 UUID。')
    params.set('targetId', filters.targetId)
  }
  return params
}
export async function listRecords(resource: Resource, filters: Filters, page: number, size: number): Promise<RecordPage> {
  if (!resources.includes(resource) || !count(page) || ![10, 20, 50].includes(size)) invalid()
  if (page > 10000) invalid()
  const params = query(filters, true, resource); params.set('page', String(page)); params.set('size', String(size))
  const result = await read(`/${resource}?${params}`)
  if (!object(result) || result.page !== page || result.size !== size || !count(result.totalItems) || result.totalPages !== Math.ceil(result.totalItems / size) || !Array.isArray(result.items)
      || result.items.length !== Math.min(size, Math.max(0, result.totalItems - page * size))) invalid()
  const ids = new Set<string>()
  for (const row of result.items) {
    if (!object(row) || typeof row.id !== 'string' || !uuid.test(row.id) || ids.has(row.id)) invalid()
    if (resource === 'audit') {
      requireAudit(row)
      row.createdAt = row.requestedAt; row.status = row.outcome
    }
    if (!timestamp(row.createdAt)) invalid()
    if (resource === 'users') row.name = row.displayName
    ids.add(row.id)
    for (const key of ['status', 'ownerId', 'applicationId', 'versionId', 'taskId', 'name', 'email', 'role', 'model', 'failureCode', 'requestedBy', 'usage']) {
      if (row[key] !== undefined && row[key] !== null && (typeof row[key] !== 'string' || row[key].length > 1000)) invalid()
    }
    for (const key of ['inputTokens', 'outputTokens']) if (row[key] !== undefined && row[key] !== null && !count(row[key])) invalid()
    if (row.cancellable !== undefined && typeof row.cancellable !== 'boolean') invalid()
  }
  return { items: result.items as AdminRecord[], page, size, total: result.totalItems }
}
function requireCounts(value: unknown, keys: string[]): Record<string, unknown> {
  if (!object(value) || !keys.every(key => count(value[key]))) invalid()
  return value
}
function bucket(value: unknown, deployment = false): Outcomes {
  const success = deployment ? 'published' : 'ready', pending = deployment ? 'inProgress' : 'active'
  const row = requireCounts(value, ['total', success, 'failed', pending, 'denominator', ...(deployment ? [] : ['cancelled'])])
  const succeeded = row[success] as number, failed = row.failed as number, denominator = succeeded + failed
  const cancelled = deployment ? 0 : row.cancelled as number
  const ratio = denominator ? Math.round(succeeded * 10000 / denominator) / 10000 : null
  if (row.denominator !== denominator || row.successRate !== ratio || row.total !== denominator + (row[pending] as number) + cancelled) invalid()
  return { succeeded, failed, pending: row[pending] as number, cancelled, denominator, rate: ratio }
}
export async function getMetrics(filters: Filters): Promise<Metrics> {
  const result = await read(`/metrics?${query(filters, false)}`)
  if (!object(result) || !timestamp(result.generatedAt) || !object(result.window) || result.window.field !== 'createdAt') invalid()
  for (const key of ['from', 'to'] as const) {
    const expected = filters[key] ? Date.parse(filters[key]) : null
    const actual = result.window[key]
    if (expected === null ? actual !== null : !timestamp(actual) || Date.parse(actual) !== expected) invalid()
  }
  const generation = bucket(result.generation), deployment = bucket(result.deployment, true)
  const tokens = requireCounts(result.tokens, ['calls', 'knownCalls', 'unknownCalls', 'pendingCalls', 'knownInputTokens', 'knownOutputTokens', 'knownTotalTokens'])
  if (tokens.calls !== (tokens.knownCalls as number) + (tokens.unknownCalls as number) + (tokens.pendingCalls as number)
      || tokens.complete !== (tokens.calls === tokens.knownCalls) || tokens.knownTotalTokens !== (tokens.knownInputTokens as number) + (tokens.knownOutputTokens as number)) invalid()
  for (const [key, known] of [['inputTokens', 'knownInputTokens'], ['outputTokens', 'knownOutputTokens'], ['totalTokens', 'knownTotalTokens']]) {
    if (tokens.complete ? tokens[key!] !== tokens[known!] : tokens[key!] !== null) invalid()
  }
  const repairs = requireCounts(result.repairs, ['total', 'tasksWithRepairs', 'readyAfterRepair', 'denominator'])
  return { generation, deployment, usage: { inputTokens: tokens.inputTokens as number | null, outputTokens: tokens.outputTokens as number | null,
    unknownCalls: tokens.unknownCalls as number, pendingCalls: tokens.pendingCalls as number, knownTotalTokens: tokens.knownTotalTokens as number },
    repairs: repairs as unknown as Metrics['repairs'], trend: [] }
}
// A has no trend endpoint: read seven real UTC day windows only when expanded.
export async function getGenerationTrend(filters: Filters): Promise<Metrics['trend']> {
  query(filters, false)
  const end = filters.to ? new Date(filters.to) : new Date()
  const last = new Date(end.valueOf() - 1); last.setUTCHours(0, 0, 0, 0)
  const rows = Array.from({ length: 7 }, (_, index) => {
    const day = new Date(last.valueOf() - (6 - index) * 86400000)
    const from = Math.max(day.valueOf(), filters.from ? Date.parse(filters.from) : -Infinity)
    const to = Math.min(day.valueOf() + 86400000, end.valueOf())
    return { day: day.toISOString().slice(0, 10), from, to }
  }).filter(row => row.from < row.to)
  return Promise.all(rows.map(async row => ({ day: row.day, generation: (await getMetrics({ ...filters, from: new Date(row.from).toISOString(), to: new Date(row.to).toISOString() })).generation })))
}
function requireAudit(value: unknown): asserts value is Audit {
  if (!object(value) || value.action !== 'TASK_CANCEL' || value.targetType !== 'TASK' || typeof value.reason !== 'string'
      || !['id', 'actorId', 'targetId'].every(key => typeof value[key] === 'string' && uuid.test(value[key] as string))
      || !['CANCELLED', 'ALREADY_TERMINAL', 'NOT_FOUND', 'FAILED', 'UNKNOWN'].includes(String(value.outcome)) || !timestamp(value.requestedAt)
      || (value.outcome === 'UNKNOWN' ? value.completedAt !== null : !timestamp(value.completedAt))) invalid()
}
export class CancellationRejected extends Error {
  constructor(message: string, public readonly status: number) { super(message) }
}
async function postCancellation(taskId: string, reason: string): Promise<unknown> {
  let response: Response
  try {
    response = await fetch(`${base}/tasks/${encodeURIComponent(taskId)}/cancel`, { method: 'POST', credentials: 'same-origin', cache: 'no-store',
      signal: AbortSignal.timeout(15_000), headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'X-CSRF-Token': session.csrfToken! },
      body: JSON.stringify({ reason }) })
  } catch { throw new ApiError('network') }
  if (response.status === 401) throw new ApiError('unauthorized', 401)
  if (response.status === 403) throw new ApiError('forbidden', 403)
  if (response.status === 400) throw new CancellationRejected('取消参数无效，请核对任务和理由。', 400)
  if (response.status === 404) throw new CancellationRejected('目标不存在，请刷新核对。', 404)
  if (response.status === 503) {
    const body: unknown = await response.json().catch(() => null)
    if (object(body) && body.code === 'ADMIN_AUDIT_UNAVAILABLE') throw new CancellationRejected('审计账本不可用，任务未被改动，请联系维护者后重试。', 503)
  }
  if (!response.ok) throw new ApiError(response.status === 429 ? 'rate-limited' : 'server', response.status)
  try { return await response.json() as unknown } catch { throw new ApiError('server', response.status) }
}
export async function cancelTask(taskId: string, reason: string): Promise<Cancellation> {
  requireAdmin()
  if (!uuid.test(taskId) || !reason.trim() || [...reason.trim()].length > 200 || /[\p{Cc}\p{Cf}]/u.test(reason.trim())) throw new CancellationRejected('取消需要明确的任务和 1–200 字理由，不含控制字符。', 400)
  if (!session.csrfToken) throw new ApiError('unauthorized', 401)
  const result = await postCancellation(taskId, reason.trim())
  if (!object(result) || !object(result.task) || result.task.id !== taskId || !timestamp(result.task.createdAt)
      || !['PLAN', 'GENERATE', 'VERIFY', 'REPAIR', 'READY', 'FAILED'].includes(String(result.task.status)) || typeof result.task.cancellable !== 'boolean') invalid()
  requireAudit(result.audit)
  if (result.audit.targetId !== taskId || result.audit.actorId !== session.user?.id) invalid()
  if (result.audit.outcome === 'CANCELLED' && (result.task.status !== 'FAILED' || result.task.failureCode !== 'CANCELLED' || result.task.cancellable !== false || result.audit.resultingStatus !== 'FAILED')) invalid()
  if (result.audit.outcome === 'ALREADY_TERMINAL' && (!['READY', 'FAILED'].includes(String(result.task.status)) || result.audit.resultingStatus !== result.task.status)) invalid()
  return result as unknown as Cancellation
}
export function successRate(value: Outcomes) {
  if (value.rate !== undefined) return value.rate === null ? '暂无已知终态' : `${(value.rate * 100).toFixed(1)}%`
  const terminal = value.succeeded + value.failed
  return terminal ? `${(value.succeeded / terminal * 100).toFixed(1)}%` : '暂无已知终态'
}
export const cancellable = (row: AdminRecord) => row.cancellable === true && ['PLAN', 'GENERATE', 'VERIFY', 'REPAIR'].includes(row.status ?? '')
export function statusLabel(status?: string | null) {
  const labels: Record<string, string> = { READY: '成功', PUBLISHED: '成功', SUCCEEDED: '成功', FAILED: '失败',
    PLAN: '计划中', GENERATE: '生成中', VERIFY: '验证中', REPAIR: '修复中', REQUESTED: '等待处理',
    ACTIVE: '启用', DISABLED: '停用', ARCHIVED: '归档', CANCELLED: '已取消', ALREADY_TERMINAL: '已经终止', NOT_FOUND: '目标不存在', UNKNOWN: '未知', USER: '普通用户', ADMIN: '管理员' }
  return status && labels[status] ? `${labels[status]} · ${status}` : `未知${status ? ` · ${status}` : ''}`
}
