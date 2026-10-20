// TEMPORARY D16-A review reproduction (private review worktree, never committed to B's branch).
// Feeds B's exportSource the exact response shape of D16-A PR #48 (SourceExportController @ feb820c):
// route /api/v0/versions/{id}/export, X-CodeLess-* headers, streamed body without Content-Length.
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { webcrypto } from 'node:crypto'
import { Blob as NodeBlob } from 'node:buffer'
import { readFileSync } from 'node:fs'
import { exportSource } from '../features/source/export-api'
import { session } from '../features/auth/session'
import type { Version } from '../features/versions/version-api'

const evidence = 'F:/JAVA/CodeLess/CodeLess/tests/export/evidence/2026-10-19/'
const t4 = JSON.parse(readFileSync(evidence + 'D16-A-T4.json', 'utf8')).manifest
const zip = readFileSync(evidence + `export-${t4.versionId}.zip`)
const version: Version = { id: t4.versionId, applicationId: t4.applicationId, number: t4.versionNumber, status: 'VERIFIED',
  sourceDigest: t4.sourceDigest, createdAt: '2026-10-19T11:49:00Z' }
const actualHeaders = {
  'Content-Type': 'application/zip', 'Content-Disposition': `attachment; filename="codeless-${t4.versionId}.zip"`,
  'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'X-CodeLess-Version-Id': t4.versionId,
  'X-CodeLess-Source-Digest': t4.sourceDigest, 'X-CodeLess-Artifact-Digest': t4.artifactDigest, 'X-CodeLess-Content-Digest': t4.contentDigest,
}
const realApi = vi.fn(async (url: string) => url === `/api/v0/versions/${version.id}/export`
  ? new Response(zip, { headers: actualHeaders })
  : new Response(JSON.stringify({ code: 'NOT_FOUND' }), { status: 404, headers: { 'Content-Type': 'application/json' } }))
beforeEach(() => { session.status = 'authenticated'; vi.stubGlobal('crypto', webcrypto); vi.stubGlobal('Blob', NodeBlob); realApi.mockClear() })
afterEach(() => vi.unstubAllGlobals())

it('B requests /source-export, which the real API does not serve (404 -> not-ready message)', async () => {
  vi.stubGlobal('fetch', realApi)
  await expect(exportSource(version)).rejects.toThrow('源码导出尚未就绪')
  expect(realApi.mock.calls[0][0]).toBe(`/api/v0/versions/${version.id}/source-export`)
})

it('even on the real route, the genuine D16-A response is rejected as a mismatch', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(zip, { headers: actualHeaders })))
  await expect(exportSource(version)).rejects.toThrow('源码包与所选版本不匹配')
})

it('a FAILED/DRAFT version is still requested and its 409 is shown as a retryable failure', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ code: 'EXPORT_VERSION_UNAVAILABLE' }),
    { status: 409, headers: { 'Content-Type': 'application/json' } })))
  await expect(exportSource({ ...version, status: 'FAILED' })).rejects.toThrow('请重试')
})
