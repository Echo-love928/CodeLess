// D03-B TEST DOUBLE: application CRUD is not backed by the platform API until D04.
// The shape follows contracts/schemas/v0/application.schema.json.
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

export interface CreateApplicationInput {
  name: string
  description?: string
  dataMode: Application['dataMode']
}

const demo: Application = {
  id: '11111111-1111-4111-8111-111111111111',
  name: '社团活动页',
  description: '校园活动与报名',
  template: 'VUE',
  dataMode: 'MOCK',
  latestReadyVersionId: null,
  createdAt: '2026-09-26T12:00:00Z',
  updatedAt: '2026-09-26T12:10:00Z',
}

function storageKey(userId: string) { return `codeless:d03:mock-applications:${userId}` }

export async function listMockApplications(userId: string): Promise<Application[]> {
  const saved = localStorage.getItem(storageKey(userId))
  if (!saved) return [demo]
  try {
    const parsed: unknown = JSON.parse(saved)
    if (!Array.isArray(parsed)) throw new Error('invalid mock storage')
    return [demo, ...parsed as Application[]]
  } catch {
    throw new Error('本地测试应用数据无法读取，请清除本站存储后重试。')
  }
}

export async function createMockApplication(userId: string, input: CreateApplicationInput): Promise<Application> {
  const name = input.name.trim()
  if (!name || name.length > 120) throw new Error('应用名称需为 1–120 个字符。')
  if (!['STATIC', 'MOCK', 'LOCAL_STORAGE'].includes(input.dataMode)) throw new Error('请选择有效的数据模式。')
  const now = new Date().toISOString()
  const app: Application = {
    id: crypto.randomUUID(), name, description: input.description?.trim() || undefined,
    template: 'VUE', dataMode: input.dataMode, latestReadyVersionId: null,
    createdAt: now, updatedAt: now,
  }
  const current = (await listMockApplications(userId)).filter(item => item.id !== demo.id)
  localStorage.setItem(storageKey(userId), JSON.stringify([app, ...current]))
  return app
}
