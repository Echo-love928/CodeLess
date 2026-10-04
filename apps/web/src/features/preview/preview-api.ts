import { ApiError, requestJson } from '../../api/http'
import { session } from '../auth/session'
import { uuid } from '../workbench/task-api'

export interface PreviewCredential { applicationId: string; versionId: string; url: string; expiresAt: string }
export async function getPreviewCredential(applicationId: string, versionId: string, signal?: AbortSignal) {
  if (!uuid(applicationId) || !uuid(versionId)) throw new Error('应用或版本入口无效。')
  if (!session.csrfToken) throw new ApiError('unauthorized', 401)
  const value = await requestJson<PreviewCredential>(`/api/v0/applications/${applicationId}/versions/${versionId}/preview-credentials`, {
    method: 'POST', headers: { 'X-CSRF-Token': session.csrfToken }, signal, cache: 'no-store',
  })
  const trusted = new URL(import.meta.env.VITE_CODELESS_PREVIEW_ORIGIN || 'https://preview.codeless-preview.test')
  if (trusted.protocol !== 'https:' || trusted.username || trusted.password || trusted.hash || trusted.search || trusted.pathname !== '/')
    throw new Error('预览服务可信地址配置无效。')
  const expected = new URL(trusted.origin)
  expected.hostname = 'v' + versionId.replaceAll('-', '') + '.' + trusted.hostname
  const url = new URL(value.url)
  const expires = Date.parse(value.expiresAt)
  if (value.applicationId !== applicationId || value.versionId !== versionId || url.origin !== expected.origin ||
      url.username || url.password || url.hash || url.pathname !== '/__preview/start' ||
      url.searchParams.size !== 1 || !url.searchParams.get('credential') ||
      !Number.isFinite(expires) || expires <= Date.now() || expires > Date.now() + 121_000)
    throw new Error('预览服务返回了无效的版本或访问地址。')
  return value
}
