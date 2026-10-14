import { expect, type Page } from '@playwright/test'
import { renderPreviewSelector } from '../../../templates/vue/preview-bridge/selector.mjs'
import { installVersionsFixture, openWorkbench, appId, ids, hash, manifest } from '../versions/fixture'

// Named D14 UI contract fixture. Browser/platform/selector are real; API/build/model are doubles.
export async function visualFixture(page: Page) {
  const previous = await installVersionsFixture(page)
  const file = 'src/components/SharedCard.vue', componentId = 'shared-card'
  const source = (text: string, color: string, spacing: string) => `<template><article data-ai-component="shared-card"><a href="#destination">${text}</a></article></template><style scoped>article{color:${color};padding:${spacing}}</style>`
  const initial = { id: ids[1], applicationId: appId, number: 2, status: 'VERIFIED', buildId: '99999999-9999-4999-8999-999999999999', createdAt: '2026-10-14T00:00:00Z' }
  const payloads = new Map<string, { text: string; color: string; spacing: string; content: string; digest: string }>()
  function put(id: string, text: string, color: string, spacing: string) {
    const content = source(text, color, spacing)
    const digest = hash(JSON.stringify(manifest([{ path: file, content }])))
    payloads.set(id, { text, color, spacing, content, digest }); return digest
  }
  previous.records = [{ ...initial, status: 'VERIFIED', sourceDigest: put(initial.id, '原文案', 'rgb(0, 0, 0)', '8px') }]
  let latestReadyVersionId = initial.id
  await page.route(`**/api/v0/applications/${appId}`, route => route.fulfill({ json: { id: appId, name: 'D14 组件修改验收', template: 'VUE', dataMode: 'STATIC', status: 'ACTIVE',
    baseVersionId: initial.id, latestReadyVersionId, createdAt: initial.createdAt, updatedAt: initial.createdAt } }))
  let counter = 0, outcome: 'READY' | 'FAILED' | 'FUTURE' = 'READY', selectionStatus = 200, editStatus = 202
  let current: { id: string; versionId: string; buildId: string; baseVersionId: string; prompt: string; status: string; updatedAt: string } | undefined
  const edits: Record<string, unknown>[] = [], selections: Record<string, unknown>[] = []
  const task = () => ({ id: current!.id, applicationId: appId, prompt: current!.prompt, status: current!.status, repairAttempts: 0,
    failureCode: current!.status === 'FAILED' ? 'BUILD_FAILED' : null, createdAt: '2026-10-14T00:00:00Z', updatedAt: current!.updatedAt })
  await page.route('**/component-mapping', route => {
    const id = route.request().url().split('/versions/')[1].split('/')[0], value = payloads.get(id)!
    return route.fulfill({ json: { protocol: 'codeless-component-mapping/v1', versionId: id, sourceDigest: value.digest,
      components: [{ componentId, sourceFile: file, fileDigest: hash(value.content), scope: 'SOURCE_FILE' }], disabled: [] } })
  })
  await page.route('**/component-selection', route => {
    const candidate = route.request().postDataJSON(); selections.push(candidate)
    const value = payloads.get(candidate.versionId)!
    return route.fulfill({ status: selectionStatus, json: { selectable: true, ...candidate, sourceFile: file,
      fileDigest: hash(value.content), scope: 'SOURCE_FILE', shared: true, notice: '修改影响整个组件源码及所有实例。' } })
  })
  await page.route('**/component-edits', route => {
    const body = route.request().postDataJSON(); edits.push(body)
    if (editStatus !== 202) return route.fulfill({ status: editStatus, json: { code: 'EDIT_VERSION_CONFLICT' } })
    counter++
    current = { id: `aaaaaaaa-aaaa-4aaa-8aaa-${String(counter).padStart(12, '0')}`,
      versionId: `bbbbbbbb-bbbb-4bbb-8bbb-${String(counter).padStart(12, '0')}`,
      buildId: `cccccccc-cccc-4ccc-8ccc-${String(counter).padStart(12, '0')}`,
      baseVersionId: body.baseVersionId, prompt: body.prompt, status: 'VERIFY', updatedAt: '2026-10-14T00:01:00Z' }
    return route.fulfill({ status: 202, json: { task: task(), baseVersionId: current.baseVersionId } })
  })
  await page.route('**/api/v0/tasks/*', route => route.fulfill({ json: task() }))
  await page.route('**/api/v0/tasks/*/diagnostics', route => route.fulfill({ json: { taskId: current!.id,
    files: { available: false, revision: 0, changes: [] }, builds: current!.status === 'VERIFY' ? [] : [{
      id: current!.buildId, versionId: current!.versionId, status: outcome === 'FAILED' ? 'FAILED' : 'SUCCEEDED',
      exitCode: outcome === 'FAILED' ? 2 : 0, artifactDigest: outcome === 'FAILED' ? null : hash('fixture artifact'),
      createdAt: '2026-10-14T00:01:00Z', completedAt: '2026-10-14T00:02:00Z' }] } }))
  await page.route('**/api/v0/tasks/*/events?*', route => route.fulfill({ json: current!.status === 'FAILED' ? [{
    id: current!.buildId, taskId: current!.id, sequence: 1, type: 'TASK_FAILED', stage: 'FAILED',
    message: 'Vue 编译失败：语法错误 <script>window.__logExecuted=true</script>', occurredAt: '2026-10-14T00:02:00Z' }] : [] }))
  await page.route('**/api/v0/tasks/*/events', route => route.fulfill({ contentType: 'text/event-stream', body: ': fixture EOF is not success\n\n' }))
  await page.route('**/api/v0/versions/*', route => {
    const id = route.request().url().split('/versions/')[1]
    return route.fulfill({ json: previous.records.find(item => item.id === id) })
  })
  await page.route('**/api/v0/versions/*/files', route => {
    const id = route.request().url().split('/versions/')[1].split('/')[0], value = payloads.get(id)!
    return route.fulfill({ json: { versionId: id, sourceDigest: value.digest, files: manifest([{ path: file, content: value.content }]) } })
  })
  await page.route('**/api/v0/versions/*/files/content?*', route => {
    const id = route.request().url().split('/versions/')[1].split('/')[0], value = payloads.get(id)!
    return route.fulfill({ json: { versionId: id, sourceDigest: value.digest, ...manifest([{ path: file, content: value.content }])[0], content: value.content } })
  })
  await page.route('**/preview-credentials', route => {
    const id = route.request().url().split('/versions/')[1].split('/')[0]
    previous.credentialIds.push(id)
    return route.fulfill({ json: { applicationId: appId, versionId: id, url: `https://v${id.replaceAll('-', '')}.preview.codeless-preview.test/__preview/start?credential=d14fixture`, expiresAt: new Date(Date.now() + 120000).toISOString() } })
  })
  await page.route('https://*.preview.codeless-preview.test/**', route => {
    const id = [...payloads.keys()].find(id => new URL(route.request().url()).hostname.includes(id.replaceAll('-', '')))!, value = payloads.get(id)!
    return route.fulfill({ contentType: 'text/html; charset=utf-8', body: `<!doctype html><meta charset="utf-8"><style>article{color:${value.color};padding:${value.spacing}}article a{color:inherit}</style>
      <script>${renderPreviewSelector({ platformOrigin: 'http://127.0.0.1:4173', versionId: id, sourceDigest: value.digest })}</script>
      ${[1, 2, 3].map(n => `<article data-ai-component="shared-card"><a href="#destination">${value.text} ${n}</a></article>`).join('')}<p id="destination">导航目标</p>
      <script>parent.postMessage({type:'codeless-preview',state:'loaded'},'http://127.0.0.1:4173')</script>` })
  })
  await openWorkbench(page)
  await expect(page.getByLabel('选择组件进行修改')).toBeEnabled()
  return { edits, selections, payloads, previous, get current() { return current! },
    denySelection: (status: number) => { selectionStatus = status }, denyEdit: (status: number) => { editStatus = status },
    async finish(state: typeof outcome, change: Partial<{ text: string; color: string; spacing: string }> = {}) {
      outcome = state; current!.status = state; current!.updatedAt = '2026-10-14T00:02:00Z'
      if (state === 'READY') {
        latestReadyVersionId = current!.versionId
        const value = { ...payloads.get(current!.baseVersionId)!, ...change }
        const digest = put(current!.versionId, value.text, value.color, value.spacing)
        previous.records.unshift({ ...initial, id: current!.versionId, number: counter + 2, taskId: current!.id,
          buildId: current!.buildId, sourceDigest: digest, status: 'VERIFIED' })
      }
      await page.getByRole('button', { name: '刷新修改状态', exact: true }).click()
    } }
}
