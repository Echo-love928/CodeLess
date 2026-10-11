import { requestJson } from '../../api/http'
import { uuid } from '../workbench/task-api'

export interface Version {
  id: string
  applicationId: string
  number: number
  sourceDigest: string
  status: 'DRAFT' | 'VERIFIED' | 'FAILED'
  buildId?: string | null
  createdAt: string
  taskId?: string | null
  errorSummary?: string | null
}
export interface VersionPage { items: Version[]; page: number; size: number; total: number }
export const digest = (value: unknown): value is string => typeof value === 'string' && /^sha256:[a-f0-9]{64}$/.test(value)
const optionalUuid = (value: unknown) => value == null || uuid(value)

function version(value: Version, applicationId: string): Version {
  if (!value || !uuid(value.id) || value.applicationId !== applicationId ||
      !Number.isSafeInteger(value.number) || value.number < 1 || !digest(value.sourceDigest) ||
      !['DRAFT', 'VERIFIED', 'FAILED'].includes(value.status) ||
      !optionalUuid(value.taskId) || !optionalUuid(value.buildId) ||
      (value.status === 'VERIFIED' && !uuid(value.buildId)) ||
      typeof value.createdAt !== 'string' || !Number.isFinite(Date.parse(value.createdAt)) ||
      (value.errorSummary != null && (typeof value.errorSummary !== 'string' || value.errorSummary.length > 2000)))
    throw new Error('版本响应无效，无法确认验证状态。')
  return value
}

// Proposed D11 task-local read contract; see README.md. No workspace fallback.
export async function listVersions(applicationId: string, page = 0, signal?: AbortSignal): Promise<VersionPage> {
  if (!uuid(applicationId)) throw new Error('应用入口无效。')
  const result = await requestJson<VersionPage>(`/api/v0/applications/${applicationId}/versions?page=${page}&size=20`, { signal, cache: 'no-store' })
  if (!result || !Array.isArray(result.items) || result.items.length > 20 || result.page !== page || result.size !== 20 ||
      !Number.isSafeInteger(result.total) || result.total < 0 ||
      result.items.length !== Math.min(20, Math.max(0, result.total - page * 20)))
    throw new Error('版本列表响应无效，请重新读取。')
  result.items.forEach(item => version(item, applicationId))
  if (new Set(result.items.map(item => item.id)).size !== result.items.length ||
      new Set(result.items.map(item => item.number)).size !== result.items.length)
    throw new Error('版本列表含重复记录，请重新读取。')
  return result
}
