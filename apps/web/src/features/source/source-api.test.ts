import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createHash, webcrypto } from 'node:crypto'
import { getSource } from './source-api'
import type { Version } from '../versions/version-api'

const hash = (value: string) => 'sha256:' + createHash('sha256').update(value, 'utf8').digest('hex')
const content = '<script>alert(1)</script>原版'
const file = { path: 'src/pages/HomePage.vue', bytes: Buffer.byteLength(content), digest: hash(content), content }
const entry = () => ({ path: file.path, bytes: file.bytes, digest: file.digest })
const version: Version = { id: '55555555-5555-4555-8555-555555555555', applicationId: '11111111-1111-4111-8111-111111111111', number: 1,
  sourceDigest: hash(JSON.stringify([entry()])), status: 'VERIFIED', buildId: '99999999-9999-4999-8999-999999999999', createdAt: '2026-10-11T00:00:00Z' }
const snapshot = () => ({ versionId: version.id, sourceDigest: version.sourceDigest, files: [entry()] })
function response(manifest: unknown, value: unknown = { versionId: version.id, sourceDigest: version.sourceDigest, ...file }) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(new Response(JSON.stringify(manifest))).mockResolvedValue(new Response(JSON.stringify(value))))
}
beforeEach(() => vi.stubGlobal('crypto', webcrypto))
afterEach(() => vi.unstubAllGlobals())

describe('D11-A manifest and exact-file trust boundary', () => {
  it('reads exact version manifest then file with no-store, checks UTF-8 hashes and preserves text', async () => {
    response(snapshot())
    expect((await getSource(version)).files).toEqual([file])
    expect(fetch).toHaveBeenNthCalledWith(1, `/api/v0/versions/${version.id}/files`, expect.objectContaining({ cache: 'no-store', credentials: 'same-origin' }))
    expect(fetch).toHaveBeenNthCalledWith(2, `/api/v0/versions/${version.id}/files/content?path=src%2Fpages%2FHomePage.vue`, expect.objectContaining({ cache: 'no-store' }))
  })
  it('rejects mismatched manifest ID/digest and forged canonical aggregate', async () => {
    for (const value of [{ ...snapshot(), versionId: version.applicationId }, { ...snapshot(), sourceDigest: 'sha256:' + 'b'.repeat(64) },
      { ...snapshot(), files: [{ ...entry(), digest: 'sha256:' + 'b'.repeat(64) }] }]) {
      response(value); await expect(getSource(version)).rejects.toThrow('不匹配')
      expect(fetch).toHaveBeenCalledTimes(1)
    }
  })
  it.each(['../secret', '/secret', 'src/../secret', 'src\\secret', 'src/./secret', 'https://external.test/file', 'src/pages/NUL.vue'])('rejects unsafe source path %s', async path => {
    response({ ...snapshot(), files: [{ ...entry(), path }] })
    await expect(getSource(version)).rejects.toThrow('文件响应无效')
  })
  it('rejects case aliases and byte quotas before fetching content', async () => {
    response({ ...snapshot(), files: [entry(), { ...entry(), path: file.path.toLowerCase() }] })
    await expect(getSource(version)).rejects.toThrow('文件响应无效')
    response({ ...snapshot(), files: Array.from({ length: 5 }, (_, i) => ({ ...entry(), path: `src/pages/Page${i}.vue`, bytes: 131072 })) })
    await expect(getSource(version)).rejects.toThrow('读取上限')
  })
  it.each([{ content: content + 'changed' }, { bytes: file.bytes + 1 }, { path: 'src/pages/Other.vue' }, { versionId: version.applicationId },
    { digest: 'sha256:' + 'b'.repeat(64) }, { sourceDigest: 'sha256:' + 'b'.repeat(64) }])('rejects mismatched or tampered individual file %j', async patch => {
    response(snapshot(), { versionId: version.id, sourceDigest: version.sourceDigest, ...file, ...patch })
    await expect(getSource(version)).rejects.toThrow('不匹配')
  })
  it('distinguishes canonical empty source from unavailable and malformed source', async () => {
    const empty = { ...version, sourceDigest: hash('[]') }
    response({ versionId: empty.id, sourceDigest: empty.sourceDigest, files: [] })
    expect((await getSource(empty)).files).toEqual([])
    expect(fetch).toHaveBeenCalledTimes(1)
    response({ ...snapshot(), files: null }); await expect(getSource(version)).rejects.toThrow('响应无效')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 409 })))
    await expect(getSource(version)).rejects.toMatchObject({ status: 409 })
  })
  it('preserves exact-file 401 and passes the abort signal to both requests', async () => {
    const abort = new AbortController()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(new Response(JSON.stringify(snapshot()))).mockResolvedValue(new Response(null, { status: 401 })))
    await expect(getSource(version, abort.signal)).rejects.toMatchObject({ status: 401 })
    expect(fetch).toHaveBeenNthCalledWith(2, expect.any(String), expect.objectContaining({ signal: abort.signal }))
  })
})
