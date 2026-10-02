import { ApiError, requestJson } from '../../api/http'
import { getTask, stages, terminal, uuid, type GenerationTask } from '../../features/workbench/task-api'
import { SseParser, type SseFrame } from './sse'

export interface TaskEvent {
  id: string; taskId: string; sequence: number; type: string; stage: string; message: string; occurredAt: string
}
export const eventTypes = ['STAGE_STARTED', 'STAGE_COMPLETED', 'TOOL_RESULT', 'REPAIR_REQUESTED', 'TASK_FAILED']

export class EventLog {
  sequence = 0
  readonly items: TaskEvent[] = []
  private readonly ids = new Set<string>()
  constructor(readonly taskId: string) {}

  apply(value: TaskEvent, transportId?: string): boolean {
    if (!value || !uuid(value.id) || value.taskId !== this.taskId || !Number.isInteger(value.sequence) ||
      value.sequence < 1 || value.sequence > 2147483647 || typeof value.type !== 'string' || typeof value.stage !== 'string' ||
      typeof value.message !== 'string' || !value.message || value.message.length > 2000 || !Number.isFinite(Date.parse(value.occurredAt))) throw new Error('任务事件格式无效。')
    if (transportId !== undefined && transportId !== String(value.sequence)) throw new Error('事件游标与序号不一致。')
    if (value.sequence <= this.sequence) return false
    if (value.sequence !== this.sequence + 1 || this.ids.has(value.id)) throw new Error('事件序列存在缺口或 ID 冲突，正在补读。')
    this.sequence = value.sequence
    this.ids.add(value.id)
    this.items.push(value)
    return true
  }
}

type Connection = 'connecting' | 'connected' | 'reconnecting' | 'complete' | 'blocked'
interface Options {
  taskId: string; applicationId: string
  onEvents: (events: TaskEvent[]) => void
  onTask: (task: GenerationTask) => void
  onConnection: (state: Connection, detail?: string) => void
  onError: (error: unknown) => void
}

class StreamError extends Error {
  constructor(readonly code: string) { super(`事件连接错误：${code}`) }
}

// Fetch allows explicit Last-Event-ID and HTTP error inspection, with same-origin cookies.
export function connectTaskEvents(options: Options) {
  const abort = new AbortController()
  const log = new EventLog(options.taskId)
  const base = `/api/v0/tasks/${encodeURIComponent(options.taskId)}/events`
  const signal = abort.signal
  let delay = 1000

  async function history() {
    while (!signal.aborted) {
      const events = await requestJson<TaskEvent[]>(`${base}?afterEventId=${log.sequence}&limit=1000`, { signal })
      if (!Array.isArray(events) || events.length > 1000) throw new Error('历史事件格式无效。')
      for (const event of events) log.apply(event)
      options.onEvents([...log.items])
      if (events.length < 1000) return
    }
  }

  async function snapshot() {
    const task = await getTask(options.taskId, options.applicationId, signal)
    if (!signal.aborted) options.onTask(task)
    return task
  }

  const pause = () => new Promise<void>(resolve => {
    const finish = () => { clearTimeout(timer); signal.removeEventListener('abort', finish); resolve() }
    const timer = setTimeout(finish, delay)
    signal.addEventListener('abort', finish, { once: true })
  })

  async function run() {
    while (!signal.aborted) {
      try {
        const task = await snapshot()
        await history()
        if (signal.aborted) return
        if (terminal(task)) { options.onConnection('complete'); return }
        if (!stages.includes(task.status as typeof stages[number])) throw new StreamError('UNKNOWN_TASK_STATE')
        options.onConnection('connecting')
        const response = await fetch(base, { signal, credentials: 'same-origin', headers: {
          Accept: 'text/event-stream', 'Last-Event-ID': String(log.sequence),
        } })
        if (!response.ok) {
          if (response.status === 401) throw new ApiError('unauthorized', 401)
          if ([403, 404].includes(response.status)) throw new ApiError('forbidden', response.status)
          const body = await response.json().catch(() => ({})) as { code?: string }
          throw new StreamError(body.code ?? `HTTP_${response.status}`)
        }
        if (!response.headers.get('content-type')?.startsWith('text/event-stream') || !response.body) throw new StreamError('SSE_UNAVAILABLE')
        options.onConnection('connected')
        const reader = response.body.getReader()
        const decoder = new TextDecoder()
        let changed = false
        const parser = new SseParser((frame: SseFrame) => {
          if (frame.event === 'stream-error') {
            const value = JSON.parse(frame.data) as { code?: string }
            throw new StreamError(value.code ?? 'EVENT_STREAM_FAILED')
          }
          if (frame.event !== 'task-event') return
          if (!frame.id) throw new Error('任务事件缺少游标。')
          if (log.apply(JSON.parse(frame.data) as TaskEvent, frame.id)) changed = true
        })
        try {
          while (!signal.aborted) {
            const result = await reader.read()
            if (result.done) break
            parser.push(decoder.decode(result.value, { stream: true }))
            if (changed) {
              changed = false
              delay = 1000
              options.onEvents([...log.items])
              const current = await snapshot()
              if (terminal(current)) {
                await history()
                if (!signal.aborted) options.onConnection('complete')
                return
              }
            }
          }
        } finally { await reader.cancel().catch(() => {}); reader.releaseLock() }
        // EOF is transport state, never proof of cancellation or success.
        const current = await snapshot()
        await history()
        if (terminal(current)) { options.onConnection('complete'); return }
        options.onConnection('reconnecting', '连接已结束，正在续接。')
      } catch (error) {
        if (signal.aborted) return
        if ((error instanceof ApiError && [401, 403, 404].includes(error.status ?? 0)) ||
          (error instanceof StreamError && ['NOT_FOUND', 'UNAUTHENTICATED', 'EVENT_CURSOR_AHEAD', 'INVALID_EVENT_ID', 'UNKNOWN_TASK_STATE', 'SSE_UNAVAILABLE'].includes(error.code))) {
          options.onConnection('blocked', error instanceof Error ? error.message : '事件连接不可用。')
          options.onError(error)
          return
        }
        options.onConnection('reconnecting', error instanceof Error ? error.message : '网络连接中断。')
      }
      await pause()
      delay = Math.min(delay * 2, 30000)
    }
  }
  void run()
  return () => abort.abort()
}
