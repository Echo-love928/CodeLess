import { ApiError, requestJson } from '../../api/http'
import { session } from '../auth/session'
import { uuid } from '../workbench/task-api'

export interface Candidate { versionId: string; sourceDigest: string; componentId: string | null }
export interface ComponentFile { componentId: string; sourceFile: string; fileDigest: string; scope: 'SOURCE_FILE' }
export interface Mapping { protocol: string; versionId: string; sourceDigest: string; components: ComponentFile[]; disabled: { sourceFile: string; componentId: string | null; reason: string }[] }
export type Selection = ({ selectable: true; shared: true; notice: string } & ComponentFile & Candidate) | { selectable: false; reason: string }
const digest = (value: string) => /^sha256:[a-f0-9]{64}$/.test(value) && value.length === 71
export const componentId = (value: unknown): value is string => typeof value === 'string' && value.length <= 64 && /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(value) && !/\s/.test(value)
function write(signal?: AbortSignal) {
  if (!session.csrfToken) throw new ApiError('unauthorized', 401)
  return { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': session.csrfToken }, signal, cache: 'no-store' as const }
}
export async function getMapping(versionId: string, signal?: AbortSignal) {
  if (!uuid(versionId)) throw new Error('版本入口无效。')
  const value = await requestJson<Mapping>(`/api/v0/versions/${versionId}/component-mapping`, { signal, cache: 'no-store' })
  if (value.protocol !== 'codeless-component-mapping/v1' || value.versionId !== versionId || !digest(value.sourceDigest) || !Array.isArray(value.components) || !Array.isArray(value.disabled)) throw new Error('组件映射与当前版本不匹配。')
  return value
}
export async function selectComponent(mapping: Mapping, candidate: Candidate, signal?: AbortSignal) {
  if (candidate.versionId !== mapping.versionId || candidate.sourceDigest !== mapping.sourceDigest) throw new Error('组件来自旧版本，请重新选择。')
  if (!componentId(candidate.componentId)) return { selectable: false, reason: 'MISSING_OR_INVALID_COMPONENT_ID' } as const
  const value = await requestJson<Selection>(`/api/v0/versions/${mapping.versionId}/component-selection`, { ...write(signal), body: JSON.stringify(candidate) })
  if (value.selectable) {
    const file = mapping.components.find(item => item.componentId === candidate.componentId)
    if (!file || value.sourceFile !== file.sourceFile || value.fileDigest !== file.fileDigest || value.scope !== 'SOURCE_FILE' || !value.shared || value.versionId !== mapping.versionId || value.sourceDigest !== mapping.sourceDigest || value.componentId !== candidate.componentId) throw new Error('服务端组件选择与冻结映射不一致。')
  }
  return value
}
export async function createComponentEdit(applicationId: string, selection: Selection & { selectable: true }, prompt: string, key: string) {
  if (!uuid(applicationId) || !uuid(selection.versionId)) throw new Error('组件修改入口无效。')
  // Construct the closed client projection; never serialize the server-owned path.
  return requestJson<{ task: { id: string }; baseVersionId: string }>(`/api/v0/applications/${applicationId}/component-edits`, {
    ...write(), headers: { ...write().headers, 'Idempotency-Key': key }, body: JSON.stringify({ baseVersionId: selection.versionId, prompt,
      selection: { componentId: selection.componentId, versionId: selection.versionId, sourceDigest: selection.sourceDigest } }),
  })
}
