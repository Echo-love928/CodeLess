import { ApiError } from '../../api/http'
import { session } from '../auth/session'
import { uuid } from '../workbench/task-api'
import { digest, type Version } from '../versions/version-api'

export interface SourceArchive { blob: Blob; filename: string }
const limit = 16 * 1024 * 1024
// D16-A contracts/export: a streamed ZIP for one owned VERIFIED version.
// Content-Digest identifies manifest members, not ZIP bytes. No archive/length header is required.
export async function exportSource(version: Version, signal?: AbortSignal): Promise<SourceArchive> {
  if (version.status !== 'VERIFIED') throw new Error('仅已验证版本可下载源码。')
  if (!uuid(version.id) || !uuid(version.applicationId) || !digest(version.sourceDigest) || session.status !== 'authenticated')
    throw new Error('请登录并选择有效版本后下载。')
  let response: Response
  try {
    response = await fetch(`/api/v0/versions/${version.id}/export`, { credentials: 'same-origin', redirect: 'error',
      cache: 'no-store', signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(30000)]) : AbortSignal.timeout(30000), headers: { Accept: 'application/zip' } })
  } catch { throw new ApiError('network') }
  if (!response.ok) {
    let code: unknown
    try { code = (await response.json() as { code?: unknown })?.code } catch { /* Status remains authoritative if the error body is unavailable. */ }
    if (response.status === 401) {
      const error = new ApiError('unauthorized', 401); error.message = '登录已失效，请重新登录后下载。'; throw error
    }
    if (response.status === 403) throw new ApiError('forbidden', 403)
    if (response.status === 404) throw new Error('版本不存在或你无权下载此版本。')
    if (response.status === 409) throw new Error(code === 'SNAPSHOT_UNAVAILABLE'
      ? '该版本的冻结源码快照尚不可用。' : '仅已验证且构建成功的版本可下载源码。')
    if (response.status === 400) throw new Error('版本标识无效，请重新选择版本。')
    if (response.status === 503) {
      const messages: Record<string, string> = {
        EXPORT_TEMPLATE_UNAVAILABLE: '源码导出模板尚未安装，请联系维护者。',
        EXPORT_TEMPLATE_INVALID: '源码导出模板校验失败，请联系维护者。',
        EXPORT_LIMIT_EXCEEDED: '源码包超过服务端导出上限。',
        EXPORT_PATH_REJECTED: '源码包包含不受支持的路径，已停止导出。',
        SNAPSHOT_DIGEST_MISMATCH: '冻结源码或验证报告摘要不一致，已停止下载。',
        SNAPSHOT_REPORT_INVALID: '版本验证报告无效，已停止下载。',
        SNAPSHOT_PATH_REJECTED: '冻结快照包含不受支持的文件，已停止下载。',
        SNAPSHOT_LIMIT_EXCEEDED: '冻结快照超过服务端上限，已停止下载。',
      }
      throw new Error(typeof code === 'string' && Object.hasOwn(messages, code) ? messages[code] : '服务暂时无法生成源码包，请稍后重试。')
    }
    if (response.status === 429) throw new ApiError('rate-limited', 429)
    throw new Error('源码导出服务暂时不可用，请稍后重试。')
  }
  if (response.status !== 200 || response.headers.get('Content-Type')?.split(';')[0]?.trim().toLowerCase() !== 'application/zip' ||
      response.headers.get('X-CodeLess-Version-Id') !== version.id ||
      response.headers.get('X-CodeLess-Source-Digest') !== version.sourceDigest || !response.body) {
    await response.body?.cancel(); throw new Error('源码包与所选版本不匹配，已停止下载。')
  }
  const reader = response.body.getReader(), chunks: Uint8Array<ArrayBuffer>[] = []
  let size = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.length
      if (size > limit) throw new Error('源码包超过下载上限。')
      chunks.push(new Uint8Array(value))
    }
  } catch (cause) { await reader.cancel(); throw cause }
  finally { reader.releaseLock() }
  const blob = new Blob(chunks, { type: 'application/zip' }), bytes = new Uint8Array(await blob.arrayBuffer())
  if (bytes[0] !== 80 || bytes[1] !== 75 || bytes[2] !== 3 || bytes[3] !== 4)
    throw new Error('源码包校验失败，已停止下载。')
  return { blob, filename: `codeless-${version.id}.zip` }
}
