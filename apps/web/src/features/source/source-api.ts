import { requestJson } from '../../api/http'
import { digest, type Version } from '../versions/version-api'

export interface SourceFile { path: string; content: string }
export interface SourceSnapshot { versionId: string; sourceDigest: string; files: SourceFile[] }

export async function getSource(version: Version, signal?: AbortSignal): Promise<SourceSnapshot> {
  const result = await requestJson<SourceSnapshot>(`/api/v0/versions/${version.id}/source`, { signal, cache: 'no-store' })
  if (!result || result.versionId !== version.id || !digest(result.sourceDigest) || result.sourceDigest !== version.sourceDigest ||
      !Array.isArray(result.files) || result.files.length > 200)
    throw new Error('源码快照与所选版本不匹配或响应无效。')
  let length = 0
  const paths = new Set<string>()
  for (const file of result.files) {
    if (!file || typeof file.path !== 'string' || file.path.length > 240 ||
        !/^[a-zA-Z0-9_@.-]+(?:\/[a-zA-Z0-9_@.-]+)*$/.test(file.path) ||
        file.path.split('/').some(part => part === '.' || part === '..') || paths.has(file.path) ||
        typeof file.content !== 'string' || file.content.length > 256_000)
      throw new Error('源码文件响应无效，不能显示该快照。')
    paths.add(file.path)
    length += file.content.length
    if (length > 1_000_000) throw new Error('源码快照超出文本查看器的读取上限。')
  }
  return result
}
