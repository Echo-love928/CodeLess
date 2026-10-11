import { afterEach, describe, expect, it, vi } from 'vitest'
import { getSource } from './source-api'
import type { Version } from '../versions/version-api'

const version: Version = { id: '55555555-5555-4555-8555-555555555555', applicationId: '11111111-1111-4111-8111-111111111111', number: 1,
  sourceDigest: 'sha256:' + 'a'.repeat(64), status: 'VERIFIED', buildId: '99999999-9999-4999-8999-999999999999', createdAt: '2026-10-11T00:00:00Z' }
const snapshot = () => ({ versionId: version.id, sourceDigest: version.sourceDigest, files: [{ path: 'src/App.vue', content: '<script>alert(1)</script>' }] })
function response(value: unknown) { vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(value)))) }
afterEach(() => vi.unstubAllGlobals())

describe('source snapshot trust boundary', () => {
  it('reads by immutable version ID with no-store and preserves source literally', async () => {
    const value = snapshot(); response(value)
    expect(await getSource(version)).toEqual(value)
    expect(fetch).toHaveBeenCalledWith(`/api/v0/versions/${version.id}/source`, expect.objectContaining({ cache: 'no-store', credentials: 'same-origin' }))
  })
  it('rejects the same ID with a different digest', async () => {
    response({ ...snapshot(), sourceDigest: 'sha256:' + 'b'.repeat(64) })
    await expect(getSource(version)).rejects.toThrow('不匹配')
  })
  it.each(['../secret', '/secret', 'src/../secret', 'src\\secret', 'src/./secret', 'https://external.test/file'])('rejects unsafe display path %s', async path => {
    response({ ...snapshot(), files: [{ path, content: 'secret' }] })
    await expect(getSource(version)).rejects.toThrow('文件响应无效')
  })
  it('rejects duplicate paths and excessive snapshot size without truncating', async () => {
    const value = snapshot(); value.files.push(value.files[0]!); response(value)
    await expect(getSource(version)).rejects.toThrow('文件响应无效')
    response({ ...snapshot(), files: Array.from({ length: 5 }, (_, i) => ({ path: `src/${i}.txt`, content: 'a'.repeat(250001) })) })
    await expect(getSource(version)).rejects.toThrow('读取上限')
  })
  it('distinguishes an actual empty snapshot from unavailable or malformed source', async () => {
    response({ ...snapshot(), files: [] }); expect((await getSource(version)).files).toEqual([])
    response({ ...snapshot(), files: null }); await expect(getSource(version)).rejects.toThrow('响应无效')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 404 })))
    await expect(getSource(version)).rejects.toMatchObject({ status: 404 })
  })
})
