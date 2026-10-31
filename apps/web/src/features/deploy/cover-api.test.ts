import { afterEach, expect, it, vi } from 'vitest'
import { coverEntryUrl, getCover, type Cover } from './cover-api'
import type { Publication } from './deploy-api'
const publication: Publication = { id: '55555555-5555-4555-8555-555555555555', applicationId: '11111111-1111-4111-8111-111111111111',
  versionId: '66666666-6666-4666-8666-666666666666', requestedBy: 'user', status: 'PUBLISHED', url: 'https://fixture.test/', createdAt: '2026-10-19T00:00:00Z' }
const cover: Cover = { deploymentId: publication.id, applicationId: publication.applicationId, versionId: publication.versionId,
  sourceDigest: 'sha256:' + 'a'.repeat(64), artifactDigest: 'sha256:' + 'b'.repeat(64), status: 'FAILED', attempts: 2,
  failureCode: 'CAPTURE_TIMEOUT', imageDigest: null, imageBytes: null }
afterEach(() => vi.unstubAllGlobals())
it.each([{ deploymentId: publication.versionId }, { versionId: publication.applicationId }, { applicationId: publication.id },
  { status: 'UNKNOWN' }, { entryPath: '/admin' }, { entryPath: null }, { entryPath: '//169.254.169.254/' }, { imageDigest: 'https://169.254.169.254/' }, { attempts: 3 }, { status: 'SUCCEEDED' }])('rejects wrong binding or unknown state %j', async patch => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ ...cover, ...patch }))))
  await expect(getCover(publication)).rejects.toThrow('不匹配')
})
it('derives only closed functional routes from an owned canonical publication URL', () => {
  expect(coverEntryUrl(publication, { ...cover, entryPath: '/tasks' })).toBe('https://fixture.test/tasks')
  expect(coverEntryUrl({ ...publication, url: 'javascript:alert(1)' }, cover)).toBeUndefined()
  expect(coverEntryUrl({ ...publication, url: 'https://user:secret@fixture.test/' }, cover)).toBeUndefined()
  expect(coverEntryUrl({ ...publication, url: 'https://fixture.test/?x=1' }, cover)).toBeUndefined()
})
it('preserves timeout as a distinct failure instead of publication failure or success', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(cover))))
  expect((await getCover(publication)).failureCode).toBe('CAPTURE_TIMEOUT')
  expect(publication.status).toBe('PUBLISHED')
})
