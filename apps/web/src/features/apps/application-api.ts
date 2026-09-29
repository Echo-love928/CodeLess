import { requestJson, ApiError } from '../../api/http'
import { session } from '../auth/session'

// Application fields follow contracts/schemas/v0/application.schema.json.
export interface Application {
  id: string
  name: string
  description?: string
  template: 'VUE'
  dataMode: 'STATIC' | 'MOCK' | 'LOCAL_STORAGE'
  latestReadyVersionId: string | null
  createdAt: string
  updatedAt: string
}

export interface ApplicationPage {
  items: Application[]
  page: number
  size: number
  total: number
}

export interface CreateApplicationInput {
  name: string
  description?: string
  dataMode: Application['dataMode']
}

const base = '/api/v0/applications'

function requireApplication(value: Application): Application {
  if (!value || typeof value.id !== 'string' || !value.id || typeof value.name !== 'string' || value.template !== 'VUE') throw new ApiError('server')
  return value
}

function requireCsrfToken() {
  if (!session.csrfToken) throw new ApiError('unauthorized', 401)
  return session.csrfToken
}

export async function listApplications(page = 0, size = 20): Promise<ApplicationPage> {
  const result = await requestJson<ApplicationPage>(`${base}?page=${page}&size=${size}`)
  if (!result || !Array.isArray(result.items) || !Number.isInteger(result.total) || result.total < 0) throw new ApiError('server')
  result.items.forEach(requireApplication)
  return result
}

export async function getApplication(id: string): Promise<Application> {
  return requireApplication(await requestJson<Application>(`${base}/${encodeURIComponent(id)}`))
}

export async function createApplication(input: CreateApplicationInput): Promise<Application> {
  const name = input.name.trim()
  if (!name || name.length > 120) throw new Error('应用名称需为 1–120 个字符。')
  const description = input.description?.trim()
  if (description && description.length > 1000) throw new Error('简介不能超过 1000 个字符。')
  return requireApplication(await requestJson<Application>(base, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': requireCsrfToken() },
    body: JSON.stringify({ name, ...(description ? { description } : {}), dataMode: input.dataMode }),
  }))
}
