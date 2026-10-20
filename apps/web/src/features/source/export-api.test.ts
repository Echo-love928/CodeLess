import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { Blob as NodeBlob } from 'node:buffer'
import { exportSource } from './export-api'
import { session } from '../auth/session'
import type { Version } from '../versions/version-api'

// Actual owner HTTP export from A's feb820c evidence, independently verified and clean-built.
const bytes = readFileSync(resolve('../../tests/e2e/share/fixtures/d16-a-export.zip'))
const version: Version = { id: '0df0892e-cd61-4cd7-8109-0181fbc02834', applicationId: '717b97fa-6e38-4e04-bc37-521a43a3a5ee', number: 2,
  status: 'VERIFIED', sourceDigest: 'sha256:2239f682cdf36d1fccd9adb61fe0c64736730a0d33191ec3364b09316179b9e9', createdAt: '2026-10-19T00:00:00Z' }
const headers = () => ({ 'Content-Type': 'application/zip', 'X-CodeLess-Version-Id': version.id, 'X-CodeLess-Source-Digest': version.sourceDigest,
  'X-CodeLess-Artifact-Digest': 'sha256:b8dbdd171ae24971d102cbde17a1a41a80c55d147d8b774800a6b9ceace57f87',
  'X-CodeLess-Content-Digest': 'sha256:d9514cc67562db61a3e572cc11fe4bc9cb1fda02f6ef8317d86a544bfd0375b7' })
beforeEach(() => { session.status = 'authenticated'; vi.stubGlobal('Blob', NodeBlob) })
afterEach(() => vi.unstubAllGlobals())

it('T4: accepts A real ZIP and stream headers without Content-Length, application-ID or ZIP-digest headers', async () => {
  expect(createHash('sha256').update(bytes).digest('hex')).toBe('74d3ce515e15586d87c143208875f6f2c66bb1c9f0345c9279fc8db74af383b0')
  const response = new Response(bytes, { headers: headers() })
  expect(response.headers.has('Content-Length')).toBe(false)
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response))
  const result = await exportSource(version)
  expect(fetch).toHaveBeenCalledWith(`/api/v0/versions/${version.id}/export`, expect.objectContaining({ credentials: 'same-origin', redirect: 'error', cache: 'no-store' }))
  expect(result.filename).toBe(`codeless-${version.id}.zip`)
  expect(Buffer.from(await result.blob.arrayBuffer())).toEqual(bytes)
})
it.each(['X-CodeLess-Version-Id', 'X-CodeLess-Source-Digest', 'Content-Type'])('rejects wrong or missing %s', async name => {
  for (const missing of [false, true]) {
    const values = new Headers(headers()); if (missing) values.delete(name); else values.set(name, 'wrong')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(bytes, { headers: values })))
    await expect(exportSource(version)).rejects.toThrow('不匹配')
  }
})
it.each([new Uint8Array(), new Uint8Array([80, 75, 3]), new Uint8Array([60, 104, 116, 109, 108])])('rejects empty, truncated or non-ZIP responses', async content => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(content, { headers: headers() })))
  await expect(exportSource(version)).rejects.toThrow('校验失败')
})
it('bounds streamed bytes without a length header and cancels an oversized response', async () => {
  const cancel = vi.fn()
  const body = new ReadableStream({ pull(controller) { controller.enqueue(new Uint8Array(1024 * 1024)) }, cancel })
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(body, { headers: headers() })))
  await expect(exportSource(version)).rejects.toThrow('超过下载上限')
  expect(cancel).toHaveBeenCalledOnce()
})
it('rejects a stream failure instead of returning a partial download', async () => {
  const body = new ReadableStream({ start(controller) { controller.error(new Error('connection interrupted')) } })
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(body, { headers: headers() })))
  await expect(exportSource(version)).rejects.toThrow('connection interrupted')
})
it.each([
  [401, 'UNAUTHENTICATED', '重新登录'], [403, 'FORBIDDEN', '没有权限'], [404, 'NOT_FOUND', '版本不存在或你无权'],
  [400, 'INVALID_REQUEST', '版本标识无效'], [409, 'EXPORT_VERSION_UNAVAILABLE', '仅已验证且构建成功'],
  [409, 'SNAPSHOT_UNAVAILABLE', '冻结源码快照尚不可用'], [503, 'SNAPSHOT_DIGEST_MISMATCH', '摘要不一致'],
  [503, 'EXPORT_TEMPLATE_UNAVAILABLE', '模板尚未安装'], [503, 'EXPORT_TEMPLATE_INVALID', '模板校验失败'],
  [503, 'EXPORT_LIMIT_EXCEEDED', '超过服务端'], [503, 'SNAPSHOT_PATH_REJECTED', '不受支持的文件'],
  [503, 'UNKNOWN_CODE', '暂时无法'], [429, 'TOO_MANY_REQUESTS', '次数过多'], [500, 'UNKNOWN', '暂时不可用'],
] as const)('maps A error %s/%s without falling back to latest', async (status, code, message) => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ code, message: '<script>untrusted server text</script>' }, { status })))
  await expect(exportSource(version)).rejects.toThrow(message)
  expect(fetch).toHaveBeenCalledOnce()
})
it('handles non-JSON rejection and network failure', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('upstream unavailable', { status: 503 })))
  await expect(exportSource(version)).rejects.toThrow('暂时无法')
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
  await expect(exportSource(version)).rejects.toThrow('网络连接失败')
})
it.each(['DRAFT', 'FAILED'] as const)('rejects %s locally without making a request or suggesting retry', async status => {
  vi.stubGlobal('fetch', vi.fn())
  await expect(exportSource({ ...version, status })).rejects.toThrow('仅已验证版本')
  expect(fetch).not.toHaveBeenCalled()
})
it('rejects invalid versions and logged-out sessions without making a request', async () => {
  vi.stubGlobal('fetch', vi.fn())
  await expect(exportSource({ ...version, id: '../latest' })).rejects.toThrow('有效版本')
  session.status = 'anonymous'
  await expect(exportSource(version)).rejects.toThrow('登录')
  expect(fetch).not.toHaveBeenCalled()
})
