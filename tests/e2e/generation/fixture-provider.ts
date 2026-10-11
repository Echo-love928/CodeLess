import { expect, type Page } from '@playwright/test'
import application from '../../../contracts/examples/v0/valid/application.json'
import taskExample from '../../../contracts/examples/v0/valid/task.json'
import eventExample from '../../../contracts/examples/v0/valid/event.json'
import { installMockAuth } from '../auth/mock-auth'
import type { BuildDetail } from '../../../apps/web/src/features/workbench/task-diagnostics'

export interface FixtureResults {
  provider: string; modelQualityAccepted: boolean
  failed: Omit<BuildDetail, 'versionId'>; repaired: Omit<BuildDetail, 'versionId'>
  verification: { id: string; status: string }; pageError: { id: string; status: string; failure: string }
  sourceDigest: string; sourceFileDigest: string
}

// Each test owns a new provider; page reloads and new tabs share only that test's state.
// Task/metadata/auth/signing are explicit HTTP doubles. Assets come from the real Docker build.
export class GenerationFixtureProvider {
  readonly appId = application.id
  readonly oldVersion = application.latestReadyVersionId
  readonly newVersion = '66666666-6666-4666-8666-666666666666'
  currentVersion = this.oldVersion
  task = { ...taskExample, status: 'PLAN', repairAttempts: 0, failureCode: null as string | null }
  history = [this.event('STAGE_STARTED', 'PLAN', '任务已受理')]
  creates = 0; cancels = 0; streams = 0; cursors: string[] = []; idempotencyKeys: string[] = []
  offline = false; detailsUnavailable = false; builds: BuildDetail[] = []
  private tick = 0
  private releaseCancel?: () => void
  private delayCancellation = false

  constructor(readonly results: FixtureResults, readonly assets: Record<string, string>) {
    expect(results.provider).toBe('d10-source-fixture')
    expect(results.modelQualityAccepted).toBe(false)
    expect(results.repaired.exitCode).toBe(0)
    expect(results.verification.status).toBe('PASSED')
    expect(results.pageError.status).toBe('FAILED')
  }
  private event(type: string, stage: string, message: string) {
    const sequence = (this.history?.length ?? 0) + 1
    return { ...eventExample, id: `00000000-0000-4000-8000-${String(sequence).padStart(12, '0')}`, taskId: this.task.id, sequence, type, stage, message }
  }
  private update(status: string, failureCode: string | null = null) {
    this.task = { ...this.task, status, failureCode, updatedAt: new Date(Date.UTC(2026, 9, 7, 0, 0, ++this.tick)).toISOString() }
  }
  advance(status: string, message = `进入 ${status}`) {
    if (status === 'REPAIR') this.task.repairAttempts += 1
    this.update(status)
    this.history.push(this.event(status === 'REPAIR' ? 'REPAIR_REQUESTED' : 'STAGE_STARTED', status, message))
  }
  recordFailedBuild() {
    this.builds = [{ ...this.results.failed, versionId: this.newVersion }]
    this.history.push(this.event('TOOL_RESULT', 'VERIFY', '缺失组件导致真实构建失败'))
  }
  claimComplete() { this.history.push(this.event('TOOL_RESULT', 'VERIFY', '模型声称生成完成')) }
  recordRepairedBuild() { this.builds.push({ ...this.results.repaired, versionId: this.newVersion }) }
  ready() {
    expect(this.results.verification.status).toBe('PASSED')
    this.currentVersion = this.newVersion
    this.update('READY'); this.history.push(this.event('STAGE_COMPLETED', 'READY', '真实构建与浏览器检查通过（fixture 源码）'))
  }
  fail(code = 'AGENT_ACTION_FAILED') {
    this.update('FAILED', code); this.history.push(this.event('TASK_FAILED', 'FAILED', '浏览器页面验收失败，保留最近可用版本'))
  }
  delayCancel() { this.delayCancellation = true }
  finishCancel() { this.releaseCancel?.() }

  async install(page: Page) {
    await installMockAuth(page)
    await page.route(`**/api/v0/applications/${this.appId}`, route => route.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify({ ...application, latestReadyVersionId: this.currentVersion }) }))
    await page.route('**/preview-credentials', route => {
      expect(route.request().headers()['x-csrf-token']).toBe('test-csrf-token')
      const versionId = route.request().url().split('/versions/')[1].split('/')[0]
      expect(versionId).toBe(this.currentVersion)
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ applicationId: this.appId, versionId,
        url: `https://v${versionId.replaceAll('-', '')}.preview.codeless-preview.test/__preview/start?credential=d10-fixture-only`,
        expiresAt: new Date(Date.now() + 120000).toISOString() }) })
    })
    await page.route(/^https:\/\/v[0-9a-f]{32}\.preview\.codeless-preview\.test\//, route => {
      const url = new URL(route.request().url())
      // HTTP fixture bootstrap: normalize the route before the unchanged built Vue module executes.
      // Real redirect/signing semantics are covered independently by the existing preview gate.
      const path = url.pathname === '/' || url.pathname === '/__preview/start' ? 'index.html' : url.pathname.slice(1)
      const encoded = this.assets[path]
      if (!encoded) return route.fulfill({ status: 404 })
      let body = Buffer.from(encoded, 'base64')
      if (path === 'index.html') body = Buffer.from(body.toString().replace('<head>', '<head><script>history.replaceState({}, "", "/")</script>') + '<script>window.addEventListener("load",()=>parent.postMessage({type:"codeless-preview",state:"loaded"},"http://127.0.0.1:4173"))</script>')
      return route.fulfill({ status: 200, contentType: path.endsWith('.js') ? 'application/javascript' : path.endsWith('.css') ? 'text/css' : 'text/html', body })
    })
    await page.route('**/api/v0/tasks**', async route => {
      if (this.offline) return route.abort('internetdisconnected')
      const request = route.request(), url = new URL(request.url())
      const json = (value: unknown, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(value) })
      if (url.pathname === '/api/v0/tasks' && request.method() === 'POST') {
        expect(request.headers()['x-csrf-token']).toBe('test-csrf-token')
        this.creates++; this.idempotencyKeys.push(request.headers()['idempotency-key'])
        if (this.creates > 1) this.task.id = '44444444-4444-4444-8444-444444444444'
        this.task = { ...this.task, prompt: request.postDataJSON().prompt, repairAttempts: 0 }
        this.update('PLAN'); this.history = []; this.history.push(this.event('STAGE_STARTED', 'PLAN', '任务已受理')); this.builds = []
        return json(this.task, 202)
      }
      if (url.pathname.endsWith('/cancel')) {
        expect(request.headers()['x-csrf-token']).toBe('test-csrf-token'); this.cancels++
        if (this.delayCancellation) await new Promise<void>(resolve => { this.releaseCancel = resolve })
        this.fail('CANCELLED'); return json(this.task)
      }
      if (url.pathname.endsWith('/diagnostics')) {
        if (this.detailsUnavailable) return json({}, 503)
        return json({ taskId: this.task.id, files: { available: this.builds.length > 0, revision: this.builds.length ? 1 : 0,
          changes: this.builds.length ? [{ path: 'src/pages/HomePage.vue', operation: 'ADDED', beforeDigest: null, afterDigest: this.results.sourceFileDigest }] : [] }, builds: this.builds })
      }
      if (url.pathname.endsWith('/events')) {
        if (request.headers().accept === 'text/event-stream') {
          this.streams++; this.cursors.push(request.headers()['last-event-id'] ?? '0')
          // Replay old events deliberately: the consumer must deduplicate by sequence/identity.
          return route.fulfill({ status: 200, contentType: 'text/event-stream', body: ':heartbeat\n\n' + this.history.map(event => `id: ${event.sequence}\nevent: task-event\ndata: ${JSON.stringify(event)}\n\n`).join('') })
        }
        return json(this.history.filter(event => event.sequence > Number(url.searchParams.get('afterEventId') ?? 0)))
      }
      if (!url.pathname.endsWith('/' + this.task.id)) return json({}, 404)
      return json(this.task)
    })
  }
}
