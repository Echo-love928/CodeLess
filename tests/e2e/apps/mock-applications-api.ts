import type { Page } from '@playwright/test'
import application from '../../../contracts/examples/v0/valid/application.json'

type ApplicationFixture = Omit<typeof application, 'latestReadyVersionId'> & { latestReadyVersionId: string | null }

// Contract fixture only. D04-A must provide the real paginated endpoint for live acceptance.
export async function installMockApplicationsApi(page: Page, getUserId: () => string | undefined) {
  const records = new Map<string, ApplicationFixture[]>()
  records.set('user-1', [{ ...application }])
  let createCount = 0

  await page.route('**/api/v0/applications**', async route => {
    const request = route.request()
    const url = new URL(request.url())
    const userId = getUserId()
    if (!userId) return route.fulfill({ status: 401 })
    const own = records.get(userId) ?? []
    const suffix = url.pathname.slice('/api/v0/applications'.length)
    const json = (status: number, value: unknown) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(value) })

    if (!suffix && request.method() === 'GET') {
      const pageNumber = Number(url.searchParams.get('page') ?? 0)
      const size = Number(url.searchParams.get('size') ?? 20)
      return json(200, { items: own.slice(pageNumber * size, (pageNumber + 1) * size), page: pageNumber, size, total: own.length })
    }
    if (!suffix && request.method() === 'POST') {
      if (request.headers()['x-csrf-token'] !== 'test-csrf-token') return route.fulfill({ status: 403 })
      const input = request.postDataJSON() as { name?: string; description?: string; dataMode?: string; ownerId?: string; template?: string }
      if (!input.name?.trim() || input.name.trim().length > 120 || input.ownerId || input.template || !['STATIC', 'MOCK', 'LOCAL_STORAGE'].includes(input.dataMode ?? '')) return route.fulfill({ status: 400 })
      createCount += 1
      const created = { ...application, id: `00000000-0000-4000-8000-${String(createCount).padStart(12, '0')}`, name: input.name.trim(), description: input.description ?? '', dataMode: input.dataMode as typeof application.dataMode, latestReadyVersionId: null as string | null }
      records.set(userId, [created, ...own])
      return json(201, created)
    }
    if (suffix.startsWith('/') && request.method() === 'GET') {
      const found = own.find(item => item.id === decodeURIComponent(suffix.slice(1)))
      return found ? json(200, found) : route.fulfill({ status: 404 })
    }
    return route.fulfill({ status: 404 })
  })
  return { getCreateCount: () => createCount }
}
