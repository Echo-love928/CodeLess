import type { Page } from '@playwright/test'
import taskFixture from '../../../contracts/examples/v0/valid/task.json'
import eventFixture from '../../../contracts/examples/v0/valid/event.json'

// Explicit D06-A transport fixture. It does not prove live Spring/PostgreSQL integration.
export async function installTaskFixture(page: Page) {
  let task = { ...taskFixture, status: 'PLAN', failureCode: null as string | null }
  let count = 0
  let cancels = 0
  let offline = false
  let streams = 0
  let release: (() => void) | undefined
  let delayed = false
  let history = [event(1, 'STAGE_STARTED', 'PLAN')]
  const cursors: string[] = []
  function event(sequence: number, type: string, stage: string, message = `Stage started: ${stage}`) {
    return { ...eventFixture, id: `00000000-0000-4000-8000-${String(sequence).padStart(12, '0')}`, taskId: task.id, sequence, type, stage, message }
  }
  await page.route('**/api/v0/tasks**', async route => {
    if (offline) return route.abort('internetdisconnected')
    const request = route.request()
    const url = new URL(request.url())
    const json = (value: unknown, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(value) })
    if (url.pathname === '/api/v0/tasks' && request.method() === 'POST') {
      if (request.headers()['x-csrf-token'] !== 'test-csrf-token') return json({}, 403)
      count += 1
      task = { ...task, prompt: request.postDataJSON().prompt, status: 'PLAN', failureCode: null }
      if (count > 1) task.id = '22222222-2222-4222-8222-222222222222'
      history = [event(1, 'STAGE_STARTED', 'PLAN')]
      return json(task, 202)
    }
    if (url.pathname.endsWith('/cancel')) {
      if (request.headers()['x-csrf-token'] !== 'test-csrf-token') return json({}, 403)
      cancels += 1
      if (delayed) await new Promise<void>(resolve => { release = resolve })
      task = { ...task, status: 'FAILED', failureCode: 'CANCELLED', updatedAt: '2026-09-30T11:00:00Z' }
      history.push(event(history.length + 1, 'TASK_FAILED', 'FAILED', 'Task failed; query task status for failure code'))
      return json(task)
    }
    if (url.pathname.endsWith('/events')) {
      if (request.headers().accept === 'text/event-stream') {
        streams += 1
        const cursor = request.headers()['last-event-id'] ?? '0'
        cursors.push(cursor)
        // Deliberately replay old IDs, unknown named event and comments on every connection.
        const body = ':heartbeat\nretry:1000\n\nevent: future-name\ndata: {}\n\n' + history.map(item => `id: ${item.sequence}\nevent: task-event\ndata: ${JSON.stringify(item)}\n\n`).join('')
        return route.fulfill({ status: 200, contentType: 'text/event-stream', body })
      }
      const after = Number(url.searchParams.get('afterEventId') ?? '0')
      return json(history.filter(item => item.sequence > after))
    }
    return json(task)
  })
  return {
    appId: task.applicationId,
    setOffline(value: boolean) { offline = value },
    advance(stage: string, type = 'STAGE_STARTED', message?: string) {
      task = { ...task, status: stage, updatedAt: '2026-09-30T10:59:00Z' }
      history.push(event(history.length + 1, type, stage, message))
    },
    unknown() { history.push(event(history.length + 1, 'FUTURE_EVENT', 'FUTURE_STAGE', '<script>untrusted</script>')) },
    delayCancel() { delayed = true },
    finishCancel() { release?.() },
    counts: () => ({ creates: count, cancels, streams, cursors }),
  }
}
