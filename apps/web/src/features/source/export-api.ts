import { ApiError } from '../../api/http'
import { session } from '../auth/session'
import { uuid } from '../workbench/task-api'
import { digest, type Version } from '../versions/version-api'

export interface SourceArchive { blob: Blob; filename: string }
const limit = 16 * 1024 * 1024
// Proposed adapter, pending D16-A's actual contract. Never substitute latestReadyVersionId or workspace files.
export async function exportSource(version: Version, signal?: AbortSignal): Promise<SourceArchive> {
  if (!uuid(version.id) || !uuid(version.applicationId) || !digest(version.sourceDigest) || session.status !== 'authenticated')
    throw new Error('请登录并选择有效版本后下载。')
  let response: Response
  try {
    response = await fetch(`/api/v0/versions/${version.id}/source-export`, { credentials: 'same-origin', redirect: 'error',
      cache: 'no-store', signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(30000)]) : AbortSignal.timeout(30000), headers: { Accept: 'application/zip' } })
  } catch { throw new ApiError('network') }
  if (!response.ok) {
    if (response.status === 401) throw new ApiError('unauthorized', 401)
    if (response.status === 403) throw new ApiError('forbidden', 403)
    throw new Error(response.status === 404 || response.status === 501 ? '源码导出尚未就绪，或你无权下载该版本。' : '此版本源码导出失败，请重试。')
  }
  const archiveDigest = response.headers.get('X-Archive-Digest')
  if (response.headers.get('Content-Type')?.split(';')[0]?.trim() !== 'application/zip' ||
      response.headers.get('X-Version-Id') !== version.id || response.headers.get('X-Application-Id') !== version.applicationId ||
      response.headers.get('X-Source-Digest') !== version.sourceDigest || !digest(archiveDigest) ||
      !response.body || !/^\d+$/.test(response.headers.get('Content-Length') ?? '') ||
      Number(response.headers.get('Content-Length')) > limit || Number(response.headers.get('Content-Length')) < 4) {
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
  const actualDigest = 'sha256:' + Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), byte => byte.toString(16).padStart(2, '0')).join('')
  if (size !== Number(response.headers.get('Content-Length')) || bytes[0] !== 80 || bytes[1] !== 75 || bytes[2] !== 3 || bytes[3] !== 4 || actualDigest !== archiveDigest)
    throw new Error('源码包校验失败，已停止下载。')
  return { blob, filename: `codeless-v${version.number}-${version.id}.zip` }
}
