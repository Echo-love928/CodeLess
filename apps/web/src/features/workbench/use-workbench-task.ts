import { computed, ref } from 'vue'
import { ApiError } from '../../api/http'
import { connectTaskEvents, type TaskEvent } from '../../lib/events/task-events'
import { cancelTask, createTask, getTask, running, uuid, type GenerationTask } from './task-api'

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
  let appId = ''
  let storageKey = ''
  let epoch = 0
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

  function attach(id: string, version: number) {
    stop?.()
    stop = connectTaskEvents({ taskId: id, applicationId: appId,
      onTask: value => {
        if (version !== epoch) return
        // A late status read must not replace a newer cancellation response.
        if (task.value && task.value.id === value.id && Date.parse(value.updatedAt) < Date.parse(task.value.updatedAt)) return
        if (task.value?.id === value.id && !running(task.value) && running(value)) return
        task.value = value
      },
      onEvents: value => { if (version === epoch) events.value = value },
      onConnection: (value, detail) => {
        if (version !== epoch) return
        connection.value = value
        connectionDetail.value = detail ?? ''
      },
      onError: cause => { void report(cause, version) },
    })
  }

  function dispose() { epoch += 1; stop?.(); stop = undefined }

  async function restore(applicationId: string, userId: string, linkedId?: string) {
    dispose()
    const version = epoch
    appId = applicationId
    storageKey = `codeless:task:v1:${userId}:${applicationId}`
    task.value = null; events.value = []; error.value = ''; busy.value = false; cancelling.value = false
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
      task.value = value
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
      task.value = value; events.value = []
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
      if (version === epoch) task.value = value
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
      task.value = value
      attach(value.id, version)
    } catch (cause) { await report(cause, version) }
    finally { if (version === epoch) restoring.value = false }
  }

  const canStart = computed(() => !busy.value && !restoring.value && !cancelling.value &&
    (!task.value ? !currentId : ['READY', 'FAILED'].includes(task.value.status)))
  const canCancel = computed(() => !!task.value && running(task.value) && !busy.value && !restoring.value && !cancelling.value)
  return { task, events, busy, cancelling, restoring, error, connection, connectionDetail, persistenceWarning,
    canStart, canCancel, start, cancel, restore, refresh, dispose }
}
