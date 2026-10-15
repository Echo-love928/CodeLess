import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createPublication, getPublication, loadPublicOrigin, publicOrigin, listPublications, verifiedArtifact } from './deploy-api'
import { session } from '../auth/session'

const app = '11111111-1111-4111-8111-111111111111', id = '66666666-6666-4666-8666-666666666666', user = '77777777-7777-4777-8777-777777777777'
const artifactDigest = 'sha256:' + 'b'.repeat(64), key = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const intent = { applicationId: app, versionId: id, artifactDigest, key }
const value = { id, applicationId: app, versionId: id, requestedBy: user, status: 'REQUESTED', createdAt: '2026-10-14T00:00:00Z' }
beforeEach(() => { vi.stubEnv('VITE_PUBLICATION_ORIGIN', 'https://sites.codeless-public.test'); session.status = 'authenticated'; session.csrfToken = 'csrf'; session.user = { id: user, email: 'demo@example.test', displayName: 'Demo', role: 'USER' } })
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs() })
it('uses the existing owner/CSRF publication contract without client paths or status', async () => {
  const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify(value)))
  vi.stubGlobal('fetch', fetcher)
  expect(await createPublication(intent)).toEqual(value)
  const [path, init] = fetcher.mock.calls[0]
  expect(path).toBe('/api/v0/publications'); expect(JSON.parse(init.body)).toEqual({ applicationId: app, versionId: id, artifactDigest })
  expect(init.headers['Idempotency-Key']).toBe(key)
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
  await expect(createPublication(intent)).rejects.toThrow('登录')
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

it('validates the authoritative latest success independently of the bounded attempts list', async () => {
  const success = { ...value, status: 'PUBLISHED', url: `https://d${id.replaceAll('-', '')}.sites.codeless-public.test/`, publishedAt: value.createdAt }
  const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ items: [], latestSuccessful: success })))
  vi.stubGlobal('fetch', fetcher)
  expect((await listPublications(app)).latestSuccessful).toEqual(success)
  expect(fetcher.mock.calls[0][0]).toBe(`/api/v0/applications/${app}/publications`)
  fetcher.mockResolvedValue(new Response(JSON.stringify({ items: [{ ...value, status: 'FUTURE' }], latestSuccessful: success })))
  expect(await listPublications(app)).toEqual({ items: [], latestSuccessful: success, uncertain: true })
  for (const latestSuccessful of [value, { ...success, applicationId: id }, { ...success, requestedBy: app }, { ...success, status: 'FUTURE' }]) {
    fetcher.mockResolvedValue(new Response(JSON.stringify({ items: [], latestSuccessful })))
    await expect(listPublications(app)).rejects.toThrow()
  }
})
it('requires a matching verified snapshot build/artifact binding before confirmation', async () => {
  const version = { id, applicationId: app, status: 'VERIFIED' as const, number: 1, buildId: id, sourceDigest: 'sha256:' + 'a'.repeat(64), createdAt: value.createdAt }
  const validation = { status: 'VERIFIED', sourceDigest: version.sourceDigest, artifactDigest, report: { buildId: id, buildStatus: 'SUCCEEDED', exitCode: 0, verificationStatus: 'PASSED', artifactDigest } }
  const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ versionId: id, status: 'VERIFIED', sourceDigest: version.sourceDigest, validation })))
  vi.stubGlobal('fetch', fetcher)
  expect(await verifiedArtifact(version)).toBe(artifactDigest)
  for (const patch of [{ artifactDigest: 'unknown' }, { report: { ...validation.report, exitCode: 1 } }, { sourceDigest: 'sha256:' + 'f'.repeat(64) }]) {
    fetcher.mockResolvedValue(new Response(JSON.stringify({ versionId: id, status: 'VERIFIED', sourceDigest: version.sourceDigest, validation: { ...validation, ...patch } })))
    await expect(verifiedArtifact(version)).rejects.toThrow()
  }
})
