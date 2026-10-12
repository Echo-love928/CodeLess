import { requestJson } from '../../api/http'
import { digest, type Version } from '../versions/version-api'

export interface SourceEntry { path: string; bytes: number; digest: string }
export interface SourceFile extends SourceEntry { content: string }
export interface SourceSnapshot { versionId: string; sourceDigest: string; files: SourceFile[] }
interface SourceManifest { versionId: string; sourceDigest: string; files: SourceEntry[] }

async function hash(bytes: Uint8Array): Promise<string> {
  const value = await crypto.subtle.digest('SHA-256', new Uint8Array(bytes))
  return 'sha256:' + Array.from(new Uint8Array(value), byte => byte.toString(16).padStart(2, '0')).join('')
}
function entry(file: SourceEntry): boolean {
  if (!file || typeof file.path !== 'string' || file.path.length > 240 ||
      !/^src\/(?:(?:pages|components)\/[A-Za-z][A-Za-z0-9_-]*\.vue|data\/[A-Za-z][A-Za-z0-9_-]*\.ts)$/.test(file.path) ||
      !Number.isSafeInteger(file.bytes) || file.bytes < 0 || file.bytes > 131_072 || !digest(file.digest)) return false
  const base = file.path.split('/').at(-1)!.split('.')[0]!
  return !/^(?:CON|PRN|AUX|NUL|CONIN|CONOUT|COM[0-9]+|LPT[0-9]+)$/i.test(base)
}

// D11-A immutable manifest + exact-file contract. Never read a task/workspace directory.
export async function getSource(version: Version, signal?: AbortSignal): Promise<SourceSnapshot> {
  const base = `/api/v0/versions/${version.id}/files`
  const result = await requestJson<SourceManifest>(base, { signal, cache: 'no-store' })
  if (!result || result.versionId !== version.id || !digest(result.sourceDigest) || result.sourceDigest !== version.sourceDigest ||
      !Array.isArray(result.files) || result.files.length > 40)
    throw new Error('源码快照与所选版本不匹配或响应无效。')
  let total = 0
  const paths = new Set<string>()
  for (const file of result.files) {
    if (!entry(file) || paths.has(file.path.toLowerCase())) throw new Error('源码文件响应无效，不能显示该快照。')
    paths.add(file.path.toLowerCase()); total += file.bytes
    if (total > 524_288) throw new Error('源码快照超出文本查看器的读取上限。')
  }
  const canonical = [...result.files].sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0)
    .map(file => ({ path: file.path, bytes: file.bytes, digest: file.digest }))
  if (await hash(new TextEncoder().encode(JSON.stringify(canonical))) !== result.sourceDigest)
    throw new Error('源码清单哈希与所选版本不匹配。')
  const files: SourceFile[] = []
  for (const expected of canonical) {
    const value = await requestJson<SourceFile & { versionId: string; sourceDigest: string }>(
      `${base}/content?path=${encodeURIComponent(expected.path)}`, { signal, cache: 'no-store' })
    if (!value || value.versionId !== version.id || value.sourceDigest !== result.sourceDigest || value.path !== expected.path ||
        value.bytes !== expected.bytes || value.digest !== expected.digest || typeof value.content !== 'string' || value.content.length > 131_072)
      throw new Error('源码文件与所选版本不匹配或响应无效。')
    const bytes = new TextEncoder().encode(value.content)
    if (bytes.length !== expected.bytes || await hash(bytes) !== expected.digest)
      throw new Error('源码文件内容哈希不匹配，不能显示该快照。')
    files.push({ ...expected, content: value.content })
  }
  return { versionId: result.versionId, sourceDigest: result.sourceDigest, files }
}
