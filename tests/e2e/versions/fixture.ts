import { expect, type Page } from '@playwright/test'
import application from '../../../contracts/examples/v0/valid/application.json'
import type { Version } from '../../../apps/web/src/features/versions/version-api'
import { installMockAuth, loginAsDemo } from '../auth/mock-auth'

export const appId = application.id
export const ids = ['55555555-5555-4555-8555-555555555555', '66666666-6666-4666-8666-666666666666', '77777777-7777-4777-8777-777777777777', '88888888-8888-4888-8888-888888888888']
export const versions: Version[] = ids.map((id, index) => ({
  id, applicationId: appId, number: index + 1, sourceDigest: 'sha256:' + String(index + 1).repeat(64),
  status: index < 2 ? 'VERIFIED' : index === 2 ? 'DRAFT' : 'FAILED',
  buildId: index < 2 ? '99999999-9999-4999-8999-999999999999' : null,
  createdAt: `2026-10-11T0${index}:00:00Z`, taskId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  errorSummary: index === 3 ? '构建退出码 2：缺少组件。' : null,
}))
export const malicious = '<script>window.__sourceExecuted = true; fetch("/source-executed")</script><img src=x onerror="window.__sourceExecuted=true">'

// Proposed API/auth/source/page fixtures only. Chromium and production platform UI are real.
export async function installVersionsFixture(page: Page) {
  await installMockAuth(page)
  const state = { records: versions, listStatus: 200, sourceStatus: 200, mismatch: false, credentialIds: [] as string[], sourceIds: [] as string[] }
  await page.route(`**/api/v0/applications/${appId}`, route => route.fulfill({ json: { ...application, status: 'ACTIVE', baseVersionId: ids[2], latestReadyVersionId: ids[1] } }))
  await page.route(`**/api/v0/tasks?**`, route => route.fulfill({ json: { items: [], page: 0, size: 20, total: 0 } }))
  await page.route(`**/api/v0/applications/${appId}/versions?**`, route => {
    const current = Number(new URL(route.request().url()).searchParams.get('page') ?? 0)
    return route.fulfill({ status: state.listStatus, json: { items: state.records.slice(current * 20, current * 20 + 20), page: current, size: 20, total: state.records.length } })
  })
  await page.route('**/api/v0/versions/*/source', route => {
    const id = route.request().url().split('/versions/')[1].split('/')[0]
    state.sourceIds.push(id)
    const version = state.records.find(item => item.id === id) ?? versions.find(item => item.id === id)!
    return route.fulfill({ status: state.sourceStatus, json: { versionId: state.mismatch ? ids[3] : id, sourceDigest: version.sourceDigest,
      files: [{ path: 'src/pages/HomePage.vue', content: `<template><h1>版本 ${version.number} 页面</h1></template>` }, { path: 'src/untrusted.txt', content: malicious }] } })
  })
  await page.route('**/preview-credentials', route => {
    const id = route.request().url().split('/versions/')[1].split('/')[0]
    state.credentialIds.push(id)
    if (!versions.slice(0, 2).some(item => item.id === id)) return route.fulfill({ status: 409 })
    return route.fulfill({ json: { applicationId: appId, versionId: id,
      url: `https://v${id.replaceAll('-', '')}.preview.codeless-preview.test/__preview/start?credential=fixture`, expiresAt: new Date(Date.now() + 120000).toISOString() } })
  })
  await page.route('https://*.preview.codeless-preview.test/**', route => {
    const index = ids.findIndex(id => new URL(route.request().url()).hostname.includes(id.replaceAll('-', '')))
    return route.fulfill({ contentType: 'text/html; charset=utf-8', body: `<h1>版本 ${index + 1} 页面</h1><script>parent.postMessage({type:'codeless-preview',state:'loaded'},'http://127.0.0.1:4173')</script>` })
  })
  await loginAsDemo(page)
  return state
}
export async function openWorkbench(page: Page) {
  await page.goto(`/workbench/${appId}`)
  await expect(page.getByRole('region', { name: '版本记录' })).toBeVisible()
}
