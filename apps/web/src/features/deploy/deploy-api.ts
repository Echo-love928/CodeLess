import { requestFeatureJson as requestJson } from '../workbench/feature-request'
import { session } from '../auth/session'
import { uuid } from '../workbench/task-api'
import { digest, type Version } from '../versions/version-api'
import { dedicatedHostname, siteKey } from './site-policy'

export interface Publication {
  id: string; applicationId: string; versionId: string; requestedBy: string
  status: 'REQUESTED' | 'PUBLISHED' | 'FAILED'
  url?: string | null; createdAt: string; publishedAt?: string | null
}
let runtimeOrigin = ''
export function publicOrigin(): URL {
  const url = new URL(import.meta.env.VITE_PUBLICATION_ORIGIN || runtimeOrigin)
  const preview = new URL(import.meta.env.VITE_CODELESS_PREVIEW_ORIGIN || 'https://preview.codeless-preview.test')
  if (url.protocol !== 'https:' || url.pathname !== '/' || url.search || url.hash || url.username || url.password ||
    !dedicatedHostname(url.hostname) ||
    siteKey(url.hostname) === siteKey(location.hostname) ||
    siteKey(url.hostname) === siteKey(preview.hostname))
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
export interface PublicationIntent { applicationId: string; versionId: string; artifactDigest: string; key: string }
export async function verifiedArtifact(version: Version): Promise<string> {
  const value = await requestJson<{ versionId: string; status: string; sourceDigest: string; validation: {
    status: string; sourceDigest: string; artifactDigest: string; report: {
      buildId: string; buildStatus: string; exitCode: number; verificationStatus: string; artifactDigest: string
    }
  } }>(`/api/v0/versions/${version.id}/snapshot`, { cache: 'no-store' })
  const validation = value?.validation, report = validation?.report
  if (version.status !== 'VERIFIED' || value.versionId !== version.id || value.status !== 'VERIFIED' ||
    value.sourceDigest !== version.sourceDigest || validation?.status !== 'VERIFIED' ||
    validation.sourceDigest !== version.sourceDigest || !digest(validation.artifactDigest) ||
    report?.buildId !== version.buildId || report.buildStatus !== 'SUCCEEDED' || report.exitCode !== 0 ||
    report.verificationStatus !== 'PASSED' || report.artifactDigest !== validation.artifactDigest)
    throw new Error('无法确认此版本的冻结构建产物，请重新读取版本。')
  return validation.artifactDigest
}
export async function createPublication(intent: PublicationIntent): Promise<Publication> {
  const { applicationId, versionId, artifactDigest, key } = intent
  publicOrigin()
  if (!uuid(applicationId) || !uuid(versionId) || !digest(artifactDigest) || !/^[A-Za-z0-9_-]{16,128}$/.test(key) || session.status !== 'authenticated' || !session.csrfToken)
    throw new Error('请登录后发布已验证版本。')
  return publication(await requestJson<Publication>('/api/v0/publications', { method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': session.csrfToken, 'Idempotency-Key': key },
    body: JSON.stringify({ applicationId, versionId, artifactDigest }) }), applicationId, versionId)
}
export async function listPublications(applicationId: string): Promise<{ items: Publication[]; latestSuccessful: Publication | null; uncertain?: boolean }> {
  if (!uuid(applicationId)) throw new Error('发布记录入口无效。')
  const page = await requestJson<{ items: Publication[]; latestSuccessful: Publication | null }>(`/api/v0/applications/${applicationId}/publications`, { cache: 'no-store' })
  if (!page || !Array.isArray(page.items) || page.items.length > 100 || !Object.hasOwn(page, 'latestSuccessful'))
    throw new Error('发布列表无法确认。')
  if (page.latestSuccessful !== null && publication(page.latestSuccessful, applicationId).status !== 'PUBLISHED')
    throw new Error('上次成功发布记录无法确认。')
  try {
    page.items.forEach(item => publication(item, applicationId))
    if (new Set(page.items.map(item => item.id)).size !== page.items.length) throw new Error('发布列表含重复记录。')
  } catch {
    // An unknown attempt blocks submission but cannot invalidate an independently
    // checked latestSuccessful record returned by the owner-scoped server query.
    return { items: [], latestSuccessful: page.latestSuccessful, uncertain: true }
  }
  return page
}
export async function getPublication(id: string, applicationId: string, versionId?: string): Promise<Publication> {
  if (!uuid(id) || !uuid(applicationId)) throw new Error('发布记录入口无效。')
  return publication(await requestJson<Publication>(`/api/v0/publications/${id}`, { cache: 'no-store' }), applicationId, versionId, id)
}
