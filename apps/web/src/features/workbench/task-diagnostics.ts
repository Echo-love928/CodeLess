import { ApiError, requestJson } from '../../api/http'
import { uuid } from './task-api'

export interface FileChange { path: string; operation: 'ADDED' | 'MODIFIED' | 'DELETED'; beforeDigest: string | null; afterDigest: string | null }
export interface BuildDetail { id: string; versionId: string; status: 'QUEUED' | 'RUNNING' | 'SUCCEEDED' | 'FAILED'; exitCode: number | null; artifactDigest: string | null; createdAt: string; completedAt: string | null }
export interface TaskDiagnostics { taskId: string; files: { available: boolean; revision: number; changes: FileChange[] }; builds: BuildDetail[] }

const digest = (value: unknown): value is string => typeof value === 'string' && /^sha256:[a-f0-9]{64}$/.test(value)
const date = (value: unknown) => typeof value === 'string' && Number.isFinite(Date.parse(value))

export function validateDiagnostics(value: TaskDiagnostics, id: string): TaskDiagnostics {
  const fail = () => { throw new ApiError('server') }
  if (!value || !uuid(value.taskId) || value.taskId !== id || !value.files ||
    typeof value.files.available !== 'boolean' || !Number.isInteger(value.files.revision) || value.files.revision < 0 ||
    !Array.isArray(value.files.changes) || value.files.changes.length > 40 ||
    !Array.isArray(value.builds) || value.builds.length > 100) fail()
  if (value.files.available ? value.files.revision < 1 : value.files.revision !== 0 || value.files.changes.length !== 0) fail()
  const paths = new Set<string>()
  for (const item of value.files.changes) {
    if (!item || typeof item.path !== 'string' || item.path.length > 240 ||
      !/^(src\/(pages|components)\/[A-Za-z][A-Za-z0-9_-]*\.vue|src\/data\/[A-Za-z][A-Za-z0-9_-]*\.ts)$/.test(item.path) || paths.has(item.path)) fail()
    paths.add(item.path)
    const valid = item.operation === 'ADDED' ? item.beforeDigest === null && digest(item.afterDigest) :
      item.operation === 'DELETED' ? digest(item.beforeDigest) && item.afterDigest === null :
        item.operation === 'MODIFIED' && digest(item.beforeDigest) && digest(item.afterDigest) && item.beforeDigest !== item.afterDigest
    if (!valid) fail()
  }
  const ids = new Set<string>()
  for (const item of value.builds) {
    if (!item || !uuid(item.id) || ids.has(item.id) || !uuid(item.versionId) || !date(item.createdAt) ||
      !(item.artifactDigest === null || digest(item.artifactDigest))) fail()
    ids.add(item.id)
    if (item.status === 'QUEUED' || item.status === 'RUNNING') {
      if (item.exitCode !== null || item.completedAt !== null) fail()
    } else if (item.status === 'SUCCEEDED') {
      if (item.exitCode !== 0 || !digest(item.artifactDigest) || !date(item.completedAt)) fail()
    } else if (item.status === 'FAILED') {
      if (!Number.isInteger(item.exitCode) || item.exitCode! < 1 || !date(item.completedAt)) fail()
    } else fail()
  }
  return value
}

export async function getTaskDiagnostics(id: string, signal?: AbortSignal) {
  return validateDiagnostics(await requestJson<TaskDiagnostics>(`/api/v0/tasks/${encodeURIComponent(id)}/diagnostics`, { signal }), id)
}
