import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createHash, webcrypto } from 'node:crypto'
import { Blob as NodeBlob } from 'node:buffer'
import { exportSource } from './export-api'
import { session } from '../auth/session'
import type { Version } from '../versions/version-api'

const version: Version = { id: '55555555-5555-4555-8555-555555555555', applicationId: '11111111-1111-4111-8111-111111111111', number: 1,
  status: 'VERIFIED', sourceDigest: 'sha256:' + 'a'.repeat(64), createdAt: '2026-10-19T00:00:00Z' }
const bytes = Buffer.from([80, 75, 3, 4, 1, 2]) // Explicit transport fixture, not a buildable ZIP.
const headers = () => ({ 'Content-Type': 'application/zip', 'Content-Length': String(bytes.length), 'X-Application-Id': version.applicationId,
  'X-Version-Id': version.id, 'X-Source-Digest': version.sourceDigest, 'X-Archive-Digest': 'sha256:' + createHash('sha256').update(bytes).digest('hex') })
beforeEach(() => { session.status = 'authenticated'; vi.stubGlobal('crypto', webcrypto); vi.stubGlobal('Blob', NodeBlob) })
afterEach(() => vi.unstubAllGlobals())
it('T4: exports the exact requested historical version with same-origin credentials and validates its binding', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(bytes, { headers: headers() })))
  const result = await exportSource(version)
  expect(fetch).toHaveBeenCalledWith(`/api/v0/versions/${version.id}/source-export`, expect.objectContaining({ credentials: 'same-origin', redirect: 'error', cache: 'no-store' }))
  expect(result.filename).toBe(`codeless-v1-${version.id}.zip`)
  expect(result.blob.size).toBe(bytes.length)
})
it.each(['X-Version-Id', 'X-Application-Id', 'X-Source-Digest', 'X-Archive-Digest', 'Content-Type', 'Content-Length'])('rejects wrong or missing %s before downloading', async name => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(bytes, { headers: { ...headers(), [name]: 'wrong' } })))
  await expect(exportSource(version)).rejects.toThrow('不匹配')
})
it('rejects bytes that do not match the archive digest', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(Buffer.from([80, 75, 3, 4, 1, 3]), { headers: headers() })))
  await expect(exportSource(version)).rejects.toThrow('校验失败')
})
it.each([401, 403, 404, 409, 501])('preserves rejected/unavailable export %s without a latest-version fallback', async status => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status })))
  await expect(exportSource(version)).rejects.toThrow()
  expect(fetch).toHaveBeenCalledTimes(1)
})
it('rejects invalid versions without making a request', async () => {
  vi.stubGlobal('fetch', vi.fn())
  await expect(exportSource({ ...version, id: '../latest' })).rejects.toThrow('有效版本')
  expect(fetch).not.toHaveBeenCalled()
})
