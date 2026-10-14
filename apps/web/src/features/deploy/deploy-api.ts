import { ApiError, requestJson } from '../../api/http'
import { session } from '../auth/session'
import { uuid } from '../workbench/task-api'

export interface Publication {
  id: string; applicationId: string; versionId: string; requestedBy: string
  status: 'REQUESTED' | 'PUBLISHED' | 'FAILED'
  url?: string | null; createdAt: string; publishedAt?: string | null
}
let runtimeOrigin = ''
export function publicOrigin(): URL {
  const url = new URL(import.meta.env.VITE_PUBLICATION_ORIGIN || runtimeOrigin)
  const labels = url.hostname.split('.')
  const preview = new URL(import.meta.env.VITE_CODELESS_PREVIEW_ORIGIN || 'https://preview.codeless-preview.test')
  if (url.protocol !== 'https:' || url.pathname !== '/' || url.search || url.hash || url.username || url.password ||
    !/^[a-z0-9.-]+$/.test(url.hostname) || labels.length < 3 ||
    !['test', 'com', 'net', 'org', 'dev', 'app'].includes(labels.at(-1) ?? '') ||
    labels.slice(-2).join('.') === location.hostname.split('.').slice(-2).join('.') ||
    labels.slice(-2).join('.') === preview.hostname.split('.').slice(-2).join('.'))
    throw new Error('公开站点配置不可用，请联系维护者。')
  return url
}
// Optional operator-owned static config on the platform origin. It contains no credentials.
// Never read configuration from an iframe/generated origin or a publication response.
export async function loadPublicOrigin(): Promise<URL> {
  if (import.meta.env.VITE_PUBLICATION_ORIGIN || runtimeOrigin) return publicOrigin()
  const config = await requestJson<{ publicOrigin: string }>('/codeless-publication-config.json', { cache: 'no-store' })
  if (!config || Object.keys(config).join(',') !== 'publicOrigin' || typeof config.publicOrigin !== 'string')
    throw new Error('公开站点配置不可用。')
  runtimeOrigin = config.publicOrigin
  try { return publicOrigin() } catch (error) { runtimeOrigin = ''; throw error }
}
function publication(value: Publication, applicationId: string, versionId?: string, id?: string): Publication {
  if (!value || !uuid(value.id) || value.applicationId !== applicationId || !uuid(value.versionId) ||
    versionId && value.versionId !== versionId || id && value.id !== id || value.requestedBy !== session.user?.id ||
    !['REQUESTED', 'PUBLISHED', 'FAILED'].includes(value.status) || !Number.isFinite(Date.parse(value.createdAt)) ||
    value.status !== 'PUBLISHED' && (value.url != null || value.publishedAt != null))
    throw new Error('发布响应无法确认，请刷新发布状态。')
  if (value.status === 'PUBLISHED') {
    const base = publicOrigin(), url = new URL(value.url ?? '')
    if (url.href !== `https://d${value.id.replaceAll('-', '')}.${base.host}/` ||
      !Number.isFinite(Date.parse(value.publishedAt ?? '')))
      throw new Error('公开地址与发布记录不匹配，请刷新发布状态。')
  }
  return value
}
export async function createPublication(applicationId: string, versionId: string): Promise<Publication> {
  publicOrigin()
  if (!uuid(applicationId) || !uuid(versionId) || session.status !== 'authenticated' || !session.csrfToken)
    throw new Error('请登录后发布已验证版本。')
  try {
    return publication(await requestJson<Publication>('/api/v0/publications', { method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': session.csrfToken },
      body: JSON.stringify({ applicationId, versionId }) }), applicationId, versionId)
  } catch (cause) {
    if (cause instanceof ApiError && cause.status === 409) throw new Error('该版本尚未通过验证，未发布。')
    throw cause
  }
}
export async function getPublication(id: string, applicationId: string, versionId?: string): Promise<Publication> {
  if (!uuid(id) || !uuid(applicationId)) throw new Error('发布记录入口无效。')
  return publication(await requestJson<Publication>(`/api/v0/publications/${id}`, { cache: 'no-store' }), applicationId, versionId, id)
}
