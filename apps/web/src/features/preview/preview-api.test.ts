import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { getPreviewCredential } from './preview-api'
import { session } from '../auth/session'
const request = vi.hoisted(() => vi.fn())
vi.mock('../../api/http', async original => ({ ...await original<object>(), requestJson: request }))
const app = '11111111-1111-4111-8111-111111111111'
const version = '22222222-2222-4222-8222-222222222222'
const host = 'v' + version.replaceAll('-', '') + '.preview.codeless-preview.test'
const value = (port = '') => ({ applicationId: app, versionId: version,
  url: 'https://' + host + port + '/__preview/start?credential=test-capability', expiresAt: new Date(Date.now() + 120_000).toISOString() })
beforeEach(() => { vi.clearAllMocks(); session.csrfToken = 'explicit-test-csrf'; vi.stubEnv('VITE_CODELESS_PREVIEW_ORIGIN', 'https://preview.codeless-preview.test') })
afterEach(() => { vi.unstubAllEnvs(); session.csrfToken = null })
describe('preview trusted origin', () => {
  it('rejects a valid version hostname on an untrusted TLS port', async () => {
    request.mockResolvedValue(value(':4443'))
    await expect(getPreviewCredential(app, version)).rejects.toThrow('无效')
  })
  it('accepts the configured port and rejects default or other ports', async () => {
    vi.stubEnv('VITE_CODELESS_PREVIEW_ORIGIN', 'https://preview.codeless-preview.test:4443')
    request.mockResolvedValue(value(':4443'))
    await expect(getPreviewCredential(app, version)).resolves.toMatchObject({ url: value(':4443').url })
    for (const port of ['', ':443', ':4444']) {
      request.mockResolvedValue(value(port)); await expect(getPreviewCredential(app, version)).rejects.toThrow('无效')
    }
  })
  it('accepts the default HTTPS port including its explicit equivalent', async () => {
    for (const port of ['', ':443']) {
      request.mockResolvedValue(value(port)); await expect(getPreviewCredential(app, version)).resolves.toMatchObject({ applicationId: app, versionId: version })
    }
  })
  it('rejects invalid trusted configuration before admitting a response', async () => {
    request.mockResolvedValue(value())
    for (const origin of ['http://preview.codeless-preview.test', 'https://user@preview.codeless-preview.test', 'https://preview.codeless-preview.test/path']) {
      vi.stubEnv('VITE_CODELESS_PREVIEW_ORIGIN', origin); await expect(getPreviewCredential(app, version)).rejects.toThrow()
    }
  })
})
