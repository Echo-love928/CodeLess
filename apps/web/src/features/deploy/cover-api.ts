import { requestJson } from '../../api/http'
import { digest } from '../versions/version-api'
import type { Publication } from './deploy-api'

export interface Cover {
  deploymentId: string; applicationId: string; versionId: string; sourceDigest: string; artifactDigest: string
  entryPath?: '/' | '/tasks' | '/catalog'
  status: 'QUEUED' | 'RUNNING' | 'RETRYING' | 'SUCCEEDED' | 'FAILED'
  attempts: number; failureCode: string | null; imageDigest: string | null; imageBytes: number | null
}
// Missing entryPath belongs only to historical root captures. It never means /tasks or /catalog.
export function coverEntryUrl(publication: Publication, cover: Cover): string | undefined {
  try {
    const url = new URL(publication.url ?? '')
    if (publication.status !== 'PUBLISHED' || url.protocol !== 'https:' || url.username || url.password ||
        url.pathname !== '/' || url.search || url.hash || !['/', '/tasks', '/catalog'].includes(cover.entryPath ?? '/')) return
    return new URL(cover.entryPath ?? '/', url).href
  } catch { return }
}
export async function getCover(publication: Publication, signal?: AbortSignal): Promise<Cover> {
  const deadline = AbortSignal.timeout(10000)
  const value = await requestJson<Cover>(`/api/v0/publications/${publication.id}/cover`, { signal: signal ? AbortSignal.any([signal, deadline]) : deadline, cache: 'no-store' })
  if (!value || publication.status !== 'PUBLISHED' || value.deploymentId !== publication.id ||
      value.applicationId !== publication.applicationId || value.versionId !== publication.versionId ||
      !digest(value.sourceDigest) || !digest(value.artifactDigest) ||
      (value.entryPath !== undefined && !['/', '/tasks', '/catalog'].includes(value.entryPath)) ||
      !['QUEUED', 'RUNNING', 'RETRYING', 'SUCCEEDED', 'FAILED'].includes(value.status) ||
      !Number.isSafeInteger(value.attempts) || value.attempts < 0 || value.attempts > 2 ||
      (value.status === 'FAILED' ? !['TARGET_REJECTED', 'CAPTURE_TIMEOUT', 'CAPTURE_FAILED', 'CLEANUP_FAILED', 'CAPTURE_INTERRUPTED'].includes(value.failureCode ?? '') : value.failureCode !== null && value.status !== 'RETRYING') ||
      (value.status === 'SUCCEEDED' ? !digest(value.imageDigest) || !Number.isSafeInteger(value.imageBytes) || value.imageBytes! < 24 || value.imageBytes! > 6 * 1024 * 1024 : value.imageDigest !== null || value.imageBytes !== null))
    throw new Error('封面记录与部署版本不匹配。')
  return value
}
