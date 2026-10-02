import { ApiError, requestJson } from '../../api/http'
import { session } from '../auth/session'

export const stages = ['PLAN', 'GENERATE', 'VERIFY', 'REPAIR', 'READY', 'FAILED'] as const
export interface GenerationTask {
  id: string
  applicationId: string
  prompt: string
  status: string
  repairAttempts: number
  failureCode?: string | null
  createdAt: string
  updatedAt: string
}
export const terminal = (task: GenerationTask) => task.status === 'READY' || task.status === 'FAILED'
export const running = (task: GenerationTask) => ['PLAN', 'GENERATE', 'VERIFY', 'REPAIR'].includes(task.status)
export const uuid = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(value)

function validate(value: GenerationTask, applicationId?: string): GenerationTask {
  if (!value || !uuid(value.id) || !uuid(value.applicationId) || (applicationId && value.applicationId !== applicationId) ||
    typeof value.status !== 'string' || typeof value.prompt !== 'string' || !Number.isInteger(value.repairAttempts) ||
    value.repairAttempts < 0 || value.repairAttempts > 3 || !Number.isFinite(Date.parse(value.updatedAt)) ||
    !Number.isFinite(Date.parse(value.createdAt)) || (value.failureCode != null && typeof value.failureCode !== 'string')) throw new ApiError('server')
  return value
}

function csrf() {
  if (!session.csrfToken) throw new ApiError('unauthorized', 401)
  return session.csrfToken
}

export async function getTask(id: string, applicationId?: string, signal?: AbortSignal) {
  const value = validate(await requestJson<GenerationTask>(`/api/v0/tasks/${encodeURIComponent(id)}`, { signal }), applicationId)
  if (value.id !== id) throw new ApiError('server')
  return value
}

export async function createTask(applicationId: string, prompt: string, key: string) {
  return validate(await requestJson<GenerationTask>('/api/v0/tasks', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf(), 'Idempotency-Key': key },
    body: JSON.stringify({ applicationId, prompt }),
  }), applicationId)
}

export async function cancelTask(id: string, applicationId: string) {
  const value = validate(await requestJson<GenerationTask>(`/api/v0/tasks/${encodeURIComponent(id)}/cancel`, {
    method: 'POST', headers: { 'X-CSRF-Token': csrf() },
  }), applicationId)
  if (value.id !== id) throw new ApiError('server')
  return value
}
