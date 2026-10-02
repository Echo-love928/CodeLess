import { computed, ref } from 'vue'
import { ApiError } from '../../api/http'
import { connectTaskEvents, type TaskEvent } from '../../lib/events/task-events'
import { cancelTask, createTask, getTask, running, uuid, type GenerationTask } from './task-api'
import { getTaskDiagnostics, type TaskDiagnostics } from './task-diagnostics'

export function useWorkbenchTask(onError: (error: unknown) => Promise<boolean>) {
  const task = ref<GenerationTask | null>(null)
  const events = ref<TaskEvent[]>([])
  const busy = ref(false)
  const cancelling = ref(false)
  const restoring = ref(false)
  const error = ref('')
  const connection = ref('')
  const connectionDetail = ref('')
  const persistenceWarning = ref('')
  const diagnostics = ref<TaskDiagnostics | null>(null)
  const diagnosticsError = ref('')
  let diagnosticsRequest = 0
  let diagnosticsAbort: AbortController | undefined
  let appId = ''
  let storageKey = ''
  let epoch = 0
  let subscription = 0
  let stop: (() => void) | undefined
  let pending: { prompt: string; key: string } | undefined
  let currentId: string | null = null

  function remember(id: string) {
    currentId = id
    try { localStorage.setItem(storageKey, id) }
    catch { persistenceWarning.value = '浏览器无法保存任务入口；关闭页面后需通过任务链接恢复。' }
  }

  async function report(cause: unknown, version: number) {
    if (version !== epoch) return
    if (!(await onError(cause)) && version === epoch) {
      error.value = cause instanceof ApiError && cause.status === 404 ? '任务不存在或你无权访问。' :
        cause instanceof Error ? cause.message : '任务请求失败。'
    }
  }

  function updateTask(value: GenerationTask) {
    const current = task.value
    if (current?.id === value.id) {
      // All status reads and mutation responses share the same stale-snapshot guard.
      if (Date.parse(value.updatedAt) < Date.parse(current.updatedAt)) return
      if (!running(current) && running(value)) return
    }
    task.value = value
  }

  async function loadDiagnostics(id: string, version: number) {
    diagnosticsAbort?.abort()
    diagnosticsAbort = new AbortController()
    const signal = diagnosticsAbort.signal
    const request = ++diagnosticsRequest
    try {
      const value = await getTaskDiagnostics(id, signal)
      if (signal.aborted || version !== epoch || request !== diagnosticsRequest || currentId !== id) return
      diagnostics.value = value; diagnosticsError.value = ''
    } catch (cause) {
      if (signal.aborted || version !== epoch || request !== diagnosticsRequest || currentId !== id) return
      diagnosticsError.value = '任务详情暂不可用，请刷新重试；缺失详情不能视为构建成功。'
      if (cause instanceof ApiError && [401, 403, 404].includes(cause.status ?? 0)) await report(cause, version)
    }
  }

  function attach(id: string, version: number) {
    const streamVersion = ++subscription
    const active = () => version === epoch && streamVersion === subscription && currentId === id
    stop?.()
    stop = connectTaskEvents({ taskId: id, applicationId: appId,
      onTask: value => {
        if (active()) { updateTask(value); void loadDiagnostics(id, version) }
      },
      onEvents: value => { if (active()) events.value = value },
      onConnection: (value, detail) => {
        if (!active()) return
        connection.value = value
        connectionDetail.value = detail ?? ''
      },
      onError: cause => { if (active()) void report(cause, version) },
    })
    void loadDiagnostics(id, version)
  }

  function dispose() { epoch += 1; stop?.(); stop = undefined; diagnosticsAbort?.abort() }

  async function restore(applicationId: string, userId: string, linkedId?: string) {
    dispose()
    const version = epoch
    appId = applicationId
    storageKey = `codeless:task:v1:${userId}:${applicationId}`
    task.value = null; events.value = []; error.value = ''; busy.value = false; cancelling.value = false
    diagnostics.value = null; diagnosticsError.value = ''
    connection.value = ''; connectionDetail.value = ''; persistenceWarning.value = ''; pending = undefined
    currentId = null
    try { currentId = linkedId ?? localStorage.getItem(storageKey) }
    catch { persistenceWarning.value = '浏览器无法读取任务入口；可通过任务链接恢复。'; currentId = linkedId ?? null }
    if (!currentId) { restoring.value = false; return }
    restoring.value = true
    try {
      if (!uuid(currentId)) throw new Error('任务入口无效，请使用有效的任务链接。')
      const value = await getTask(currentId, appId)
      if (version !== epoch) return
      updateTask(value)
      remember(value.id)
      attach(value.id, version)
    } catch (cause) { await report(cause, version) }
    finally { if (version === epoch) restoring.value = false }
  }

  async function start(input: string) {
    if (busy.value || restoring.value || cancelling.value || task.value && task.value.status !== 'FAILED' && task.value.status !== 'READY') return
    const prompt = input.trim()
    if (!prompt || Array.from(prompt).length > 8000) { error.value = '需求描述需为 1–8000 个字符。'; return }
    const version = epoch
    busy.value = true; error.value = ''
    if (!pending || pending.prompt !== prompt) pending = { prompt, key: crypto.randomUUID() }
    try {
      const value = await createTask(appId, prompt, pending.key)
      if (version !== epoch) return
      pending = undefined
      updateTask(value); events.value = []
      diagnostics.value = null; diagnosticsError.value = ''
      remember(value.id)
      attach(value.id, version)
    } catch (cause) { await report(cause, version) }
    finally { if (version === epoch) busy.value = false }
  }

  async function cancel() {
    if (!task.value || !running(task.value) || busy.value || cancelling.value || restoring.value) return
    const version = epoch
    const id = task.value.id
    cancelling.value = true; error.value = ''
    try {
      const value = await cancelTask(id, appId)
      if (version === epoch) { updateTask(value); void loadDiagnostics(id, version) }
    } catch (cause) { await report(cause, version) }
    finally { if (version === epoch) cancelling.value = false }
  }

  async function refresh() {
    if (!currentId || restoring.value || busy.value || cancelling.value) return
    const version = epoch
    restoring.value = true; error.value = ''
    try {
      const value = await getTask(currentId, appId)
      if (version !== epoch) return
      updateTask(value)
      attach(value.id, version)
    } catch (cause) { await report(cause, version) }
    finally { if (version === epoch) restoring.value = false }
  }

  const canStart = computed(() => !busy.value && !restoring.value && !cancelling.value &&
    (!task.value ? !currentId : ['READY', 'FAILED'].includes(task.value.status)))
  const canCancel = computed(() => !!task.value && running(task.value) && !busy.value && !restoring.value && !cancelling.value)
  return { task, events, busy, cancelling, restoring, error, connection, connectionDetail, persistenceWarning, diagnostics, diagnosticsError,
    canStart, canCancel, start, cancel, restore, refresh, dispose }
}
