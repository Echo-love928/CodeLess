import { afterEach, expect, it, vi } from 'vitest'
import { listVersions } from './version-api'

const app = '11111111-1111-4111-8111-111111111111'
const id = '55555555-5555-4555-8555-555555555555'
const sourceDigest = 'sha256:' + 'a'.repeat(64)
const item = { id, applicationId: app, number: 1, sourceDigest, status: 'FAILED', createdAt: '2026-10-12T00:00:00Z' }
const page = { items: [item], page: 0, size: 20, total: 1 }
const report = { failureCode: 'RUNNER_UNAVAILABLE', buildStatus: null, exitCode: null, verificationStatus: null }
const snapshot = () => ({ versionId: id, status: 'FAILED', sourceDigest, validation: { status: 'FAILED', sourceDigest, report } })
function responses(value: unknown, status = 200) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(new Response(JSON.stringify(page))).mockResolvedValue(new Response(JSON.stringify(value), { status })))
}
afterEach(() => vi.unstubAllGlobals())
it('shows the frozen failure code and unknown tool results without implying exit zero', async () => {
  responses(snapshot())
  const result = await listVersions(app)
  expect(result.items[0]?.errorSummary).toContain('RUNNER_UNAVAILABLE')
  expect(result.items[0]?.errorSummary).toContain('退出码 未知')
  expect(fetch).toHaveBeenNthCalledWith(2, `/api/v0/versions/${id}/snapshot`, expect.objectContaining({ cache: 'no-store' }))
})
it('keeps failed rows when their snapshot is unavailable or mismatched but never borrows a different failure', async () => {
  for (const [value, status] of [[snapshot(), 409], [{ ...snapshot(), versionId: app }, 200]] as const) {
    responses(value, status)
    const result = await listVersions(app)
    expect(result.items[0]?.status).toBe('FAILED')
    expect(result.items[0]?.errorSummary).toContain('无法读取')
    expect(result.items[0]?.errorSummary).not.toContain('RUNNER_UNAVAILABLE')
  }
})
it('preserves unauthorized failure-report reads for the login flow', async () => {
  responses({}, 401)
  await expect(listVersions(app)).rejects.toMatchObject({ status: 401 })
})
