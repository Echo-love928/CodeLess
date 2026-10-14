import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createPublication, getPublication, loadPublicOrigin, publicOrigin } from './deploy-api'
import { session } from '../auth/session'

const app = '11111111-1111-4111-8111-111111111111', id = '66666666-6666-4666-8666-666666666666', user = '77777777-7777-4777-8777-777777777777'
const value = { id, applicationId: app, versionId: id, requestedBy: user, status: 'REQUESTED', createdAt: '2026-10-14T00:00:00Z' }
beforeEach(() => { vi.stubEnv('VITE_PUBLICATION_ORIGIN', 'https://sites.codeless-public.test'); session.status = 'authenticated'; session.csrfToken = 'csrf'; session.user = { id: user, email: 'demo@example.test', displayName: 'Demo', role: 'USER' } })
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs() })
it('uses the existing owner/CSRF publication contract without client paths or status', async () => {
  const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify(value)))
  vi.stubGlobal('fetch', fetcher)
  expect(await createPublication(app, id)).toEqual(value)
  const [path, init] = fetcher.mock.calls[0]
  expect(path).toBe('/api/v0/publications'); expect(JSON.parse(init.body)).toEqual({ applicationId: app, versionId: id })
  expect(init.headers['X-CSRF-Token']).toBe('csrf'); expect(init.credentials).toBe('same-origin')
})
it('rejects foreign IDs/owner, unknown status and wrong public URL', async () => {
  for (const patch of [{ id: app }, { applicationId: id }, { requestedBy: app }, { status: 'FUTURE' },
    { status: 'PUBLISHED', url: 'https://app.codeless.test/', publishedAt: value.createdAt }]) {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ ...value, ...patch }))))
    await expect(getPublication(id, app)).rejects.toThrow()
  }
})
it('rejects missing HTTPS site config, platform/preview sharing and unauthenticated writes', async () => {
  for (const origin of ['', 'http://sites.codeless-public.test', 'https://sites.codeless-preview.test', 'https://sites.localhost']) {
    vi.stubEnv('VITE_PUBLICATION_ORIGIN', origin); expect(() => publicOrigin()).toThrow()
  }
  vi.stubEnv('VITE_PUBLICATION_ORIGIN', 'https://sites.codeless-public.test'); session.status = 'anonymous'
  await expect(createPublication(app, id)).rejects.toThrow('登录')
})
it('loads only validated operator config from the platform origin when build config is absent', async () => {
  vi.stubEnv('VITE_PUBLICATION_ORIGIN', '')
  const fetcher = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ publicOrigin: 'https://preview.codeless-preview.test' })))
    .mockResolvedValueOnce(new Response(JSON.stringify({ publicOrigin: 'https://sites.codeless-public.test' })))
  vi.stubGlobal('fetch', fetcher)
  await expect(loadPublicOrigin()).rejects.toThrow()
  expect((await loadPublicOrigin()).origin).toBe('https://sites.codeless-public.test')
  expect(fetcher.mock.calls[0][0]).toBe('/codeless-publication-config.json')
  expect(fetcher.mock.calls[0][1].credentials).toBe('same-origin')
})
