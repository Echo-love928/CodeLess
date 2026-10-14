import { computed, ref, type InjectionKey, type Ref } from 'vue'
import { ApiError } from '../../api/http'
import { connectTaskEvents, type TaskEvent } from '../../lib/events/task-events'
import { cancelTask, getTask, terminal, uuid, type GenerationTask } from '../workbench/task-api'
import { getTaskDiagnostics, type TaskDiagnostics } from '../workbench/task-diagnostics'
import { getVersion, type Version } from '../versions/version-api'

export interface AcceptedEdit { task: { id: string }; baseVersionId: string }
export interface EditContext {
  locked: Readonly<Ref<boolean>>
  begin: () => (() => void) | undefined
  accept: (value: AcceptedEdit, prompt: string, componentId: string) => void
}
export const editContext: InjectionKey<EditContext> = Symbol('visual-edit-flow')

// The workspace owns this lifecycle, so renewing an iframe cannot discard a task.
export function useVisualEditFlow(applicationId: () => string, adopt: (version: Version) => void, unauthorized: () => void) {
  const task = ref<GenerationTask | null>(null), events = ref<TaskEvent[]>([])
  const diagnostics = ref<TaskDiagnostics | null>(null)
  const error = ref(''), diagnosticsError = ref(''), connection = ref('')
  const accepted = ref<AcceptedEdit>(), description = ref(''), component = ref('')
  const result = ref<Version>(), refreshing = ref(false), cancelling = ref(false)
  const posting = ref(false)
  const locked = computed(() => posting.value || !!accepted.value && !result.value && task.value?.status !== 'FAILED')
  let epoch = 0, request = 0, stop: (() => void) | undefined, abort: AbortController | undefined

  function report(cause: unknown) {
    error.value = cause instanceof Error ? cause.message : '无法读取修改结果，请刷新修改状态。'
    if (cause instanceof ApiError && cause.status === 401) unauthorized()
  }
  function begin() {
    if (locked.value) return
    const current = epoch
    posting.value = true
    let released = false
    return () => {
      if (released) return
      released = true
      if (current === epoch) posting.value = false
    }
  }
  async function inspect(value: GenerationTask, current: number) {
    if (current !== epoch || value.id !== accepted.value?.task.id) return
    if (task.value && (Date.parse(value.updatedAt) < Date.parse(task.value.updatedAt) || terminal(task.value) && !terminal(value))) return
    task.value = value
    const serial = ++request
    abort?.abort(); abort = new AbortController()
    const signal = abort.signal
    try {
      const detail = await getTaskDiagnostics(value.id, signal)
      if (current !== epoch || serial !== request) return
      diagnostics.value = detail; diagnosticsError.value = ''
      if (value.status !== 'READY' || result.value) return
      // Match persisted version + task + successful build, never guess from latest.
      const builds = detail.builds.filter(build => build.status === 'SUCCEEDED' && build.exitCode === 0 && build.artifactDigest)
      const versions = await Promise.all(builds.map(async build => ({ build, version: await getVersion(build.versionId, applicationId(), signal) })))
      if (current !== epoch || serial !== request) return
      const matches = versions.filter(({ build, version }) => version.status === 'VERIFIED' && version.taskId === value.id &&
        version.buildId === build.id && version.id !== accepted.value?.baseVersionId)
      if (matches.length !== 1) throw new Error('无法确认此修改任务的确切已验证版本。旧版本继续保留，请刷新修改状态。')
      result.value = matches[0].version; error.value = ''; adopt(result.value)
    } catch (cause) {
      if (current !== epoch || serial !== request) return
      diagnosticsError.value = '修改诊断或版本读取失败；缺失结果不能视为修改成功。'
      report(cause)
    }
  }
  function accept(value: AcceptedEdit, prompt: string, componentId: string) {
    reset()
    accepted.value = value; description.value = prompt; component.value = componentId
    const current = epoch, app = applicationId()
    stop = connectTaskEvents({ taskId: value.task.id, applicationId: app,
      onTask: value => { if (current === epoch) void inspect(value, current) },
      onEvents: value => { if (current === epoch) events.value = value },
      onConnection: (value, detail) => { if (current === epoch) connection.value = detail ? `${value}：${detail}` : value },
      onError: cause => { if (current === epoch) report(cause) } })
  }
  async function refresh() {
    if (!accepted.value || refreshing.value) return
    const current = epoch; refreshing.value = true; error.value = ''
    try { await inspect(await getTask(accepted.value.task.id, applicationId()), current) }
    catch (cause) { if (current === epoch) report(cause) }
    finally { if (current === epoch) refreshing.value = false }
  }
  async function cancel() {
    if (!task.value || terminal(task.value) || cancelling.value) return
    const current = epoch; cancelling.value = true
    try { await inspect(await cancelTask(task.value.id, applicationId()), current) }
    catch (cause) { if (current === epoch) report(cause) }
    finally { if (current === epoch) cancelling.value = false }
  }
  function reset() {
    epoch++; request++; stop?.(); stop = undefined; abort?.abort()
    accepted.value = undefined; task.value = null; result.value = undefined
    events.value = []; diagnostics.value = null; error.value = ''; diagnosticsError.value = ''; connection.value = ''
    description.value = ''; component.value = ''; refreshing.value = false; cancelling.value = false
    posting.value = false
  }
  return { locked, begin, accept, task, accepted, events, diagnostics, diagnosticsError, description, component, result,
    error, connection, refreshing, cancelling, refresh, cancel, reset }
}

export function validateAccepted(value: AcceptedEdit, baseVersionId: string) {
  if (!value || !uuid(value.task?.id) || value.baseVersionId !== baseVersionId) throw new Error('修改响应与基版本不匹配，请先核对任务状态。')
  return value
}
