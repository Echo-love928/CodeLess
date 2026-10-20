import type { Page } from '@playwright/test'
import { installVersionsFixture, openWorkbench, appId } from '../versions/fixture'
import type { GenerationTask } from '../../../apps/web/src/features/workbench/task-api'

// D18 UI contract fixture: real platform build and Chromium, HTTP/task/model doubles.
export async function recoveryFixture(page: Page, code = 'MODEL_NETWORK') {
  await installVersionsFixture(page)
  const tasks = new Map<string, GenerationTask>(), keys = new Map<string, GenerationTask>()
  const posts: { key: string; prompt: string }[] = []
  let loseResponse = false, rejectRead = false, hang = false
  const message = '构建日志 <script>window.__recoveryExecuted=true</script>\n' + '详细诊断内容\n'.repeat(70)
  await page.route('**/api/v0/tasks', async route => {
    const request = route.request(), key = request.headers()['idempotency-key']
    const { prompt } = request.postDataJSON()
    posts.push({ key, prompt })
    if (hang) return // Deliberately held request; production deadline must settle it.
    if (!keys.has(key)) {
      const id = `aaaaaaaa-aaaa-4aaa-8aaa-${String(keys.size + 1).padStart(12, '0')}`
      const task = { id, applicationId: appId, prompt, status: 'FAILED', failureCode: code, repairAttempts: 0,
        createdAt: '2026-10-20T00:00:00Z', updatedAt: '2026-10-20T00:00:01Z' }
      tasks.set(id, task); keys.set(key, task)
    }
    if (loseResponse) { loseResponse = false; return route.abort('failed') }
    return route.fulfill({ status: 202, json: keys.get(key) })
  })
  await page.route('**/api/v0/tasks/*', route => {
    const id = new URL(route.request().url()).pathname.split('/').at(-1)!
    return route.fulfill({ status: rejectRead ? 503 : 200, json: tasks.get(id) })
  })
  await page.route('**/api/v0/tasks/*/diagnostics', route => {
    const id = new URL(route.request().url()).pathname.split('/').at(-2)!
    return route.fulfill({ json: { taskId: id, files: { available: false, revision: 0, changes: [] }, builds: [] } })
  })
  await page.route('**/api/v0/tasks/*/events?*', route => {
    const url = new URL(route.request().url()), taskId = url.pathname.split('/').at(-2)!
    return route.fulfill({ json: url.searchParams.get('afterEventId') === '0' ? [{
      id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', taskId, sequence: 1,
      type: 'TASK_FAILED', stage: 'FAILED', message, occurredAt: '2026-10-20T00:00:01Z',
    }] : [] })
  })
  await openWorkbench(page)
  return { tasks, posts, message, loseNextResponse: () => { loseResponse = true }, failReads: (value: boolean) => { rejectRead = value }, hang: () => { hang = true } }
}
