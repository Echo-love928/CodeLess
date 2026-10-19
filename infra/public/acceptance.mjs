// Actual public DNS/TLS, actual sessions and SQL-backed APIs. No routes or signing fixtures.
// Credentials arrive only on a same-host anonymous pipe; never persist or print them.
import assert from 'node:assert/strict'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { createHash, randomUUID } from 'node:crypto'
import { chromium, expect } from '@playwright/test'
import { assertConcurrentEditCheckpoint } from './acceptance-checkpoint.mjs'

let input = ''
for await (const part of process.stdin) input += part
const operator = JSON.parse(input)
input = ''
const origin = 'https://app.codeless-platform.top'
const evidence = process.argv[2]
await mkdir(evidence, { recursive: true, mode: 0o700 })
const checkpointPath = join(evidence, 'checkpoint.json')
let checkpoint = {}
try { checkpoint = JSON.parse(await readFile(checkpointPath, 'utf8')) } catch {}
const save = async () => writeFile(checkpointPath, JSON.stringify(checkpoint, null, 2))
const hash = data => 'sha256:' + createHash('sha256').update(data).digest('hex')
let stage = 'launch', browser, context, page
const checks = checkpoint.checks ?? {}
const record = async (name, value = true) => { checks[name] = value; checkpoint.checks = checks; await save() }
const progress = value => { stage = value; console.log(JSON.stringify({ stage })) }

async function csrf(request) {
  const response = await request.get(origin + '/api/v0/auth/csrf')
  assert.equal(response.status(), 200)
  return (await response.json()).token
}
async function api(method, path, data, expected = 200, extra = {}, request = context.request) {
  const response = await request.fetch(origin + path, { method, data,
    headers: { 'X-CSRF-Token': await csrf(request), ...extra } })
  assert.equal(response.status(), expected, `${method} ${path}: ${response.status()}`)
  if (response.headers()['content-type']?.includes('json')) return response.json()
  return response.text()
}
async function terminalTask(id) {
  const until = Date.now() + 240000
  while (Date.now() < until) {
    const task = await api('GET', '/api/v0/tasks/' + id)
    if (task.status === 'READY' || task.status === 'FAILED') return task
    await page.waitForTimeout(500)
  }
  throw new Error('Real task did not reach terminal state')
}
async function terminalPublication(id) {
  const until = Date.now() + 35000
  while (Date.now() < until) {
    const value = await api('GET', '/api/v0/publications/' + id)
    if (value.status !== 'REQUESTED') return value
    await page.waitForTimeout(200)
  }
  throw new Error('Publication terminal result unavailable')
}

try {
  browser = await chromium.launch({ headless: true })
  context = await browser.newContext({ serviceWorkers: 'block', acceptDownloads: false, viewport: { width: 1440, height: 1000 } })
  page = await context.newPage()
  let sse = false
  let posted
  page.on('response', response => { if (response.headers()['content-type']?.includes('text/event-stream')) sse = true })
  page.on('request', request => {
    if (request.method() === 'POST' && new URL(request.url()).pathname === '/api/v0/publications')
      posted = { data: request.postDataJSON(), key: request.headers()['idempotency-key'] }
  })
  progress('real-login')
  await page.goto(origin + '/login')
  await page.getByLabel('邮箱', { exact: true }).fill('demo@codeless.local')
  await page.getByLabel('密码', { exact: true }).fill(operator.password)
  await page.getByRole('button', { name: '登录', exact: true }).click()
  await page.waitForURL('**/apps', { timeout: 20000 })
  await record('realBrowserLogin')
  const platformCookies = await context.cookies(origin)
  assert.ok(platformCookies.some(cookie => cookie.httpOnly && cookie.secure && cookie.domain === 'app.codeless-platform.top'))
  await record('secureHostOnlyPlatformCookie')
  progress('create-real-application')
  if (!checkpoint.app) {
    checkpoint.app = await api('POST', '/api/v0/applications', { name: 'D15 公网验收 ' + new Date().toISOString(),
      description: '真实 DNS/TLS、登录、生成、预览和版本锁定发布验收；deterministic-mock，非模型质量评测。', dataMode: 'STATIC' }, 201)
    await save()
  }
  const app = checkpoint.app
  await page.goto(origin + '/workbench/' + app.id)
  await expect(page.getByLabel('需求描述')).toBeVisible()
  progress('draft-and-unauthenticated-rejections')
  const rejectedDraft = await api('POST', '/api/v0/publications', { applicationId: app.id, versionId: app.baseVersionId,
    artifactDigest: 'sha256:' + '0'.repeat(64) }, 409, { 'Idempotency-Key': randomUUID() })
  assert.ok(rejectedDraft)
  const anonymous = await browser.newContext()
  const unauthenticated = await anonymous.request.post(origin + '/api/v0/publications', { data: {
    applicationId: app.id, versionId: app.baseVersionId, artifactDigest: 'sha256:' + '0'.repeat(64) } })
  assert.ok([401, 403].includes(unauthenticated.status()))
  await anonymous.close()
  await record('draftAndUnauthenticatedCannotPublish')
  progress('real-generation-and-sse')
  if (checkpoint.task && operator.retryFailed && (await api('GET', '/api/v0/tasks/' + checkpoint.task.id)).status === 'FAILED') {
    checkpoint.failedTaskHistory = [...(checkpoint.failedTaskHistory ?? []), checkpoint.task.id]
    delete checkpoint.task
    await save()
  }
  if (!checkpoint.task) {
    await page.getByLabel('需求描述').fill('创建静态个人资料与作品页面，展示 Ada Lovelace。')
    const response = page.waitForResponse(value => value.request().method() === 'POST' && new URL(value.url()).pathname === '/api/v0/tasks')
    await page.getByRole('button', { name: /^(开始生成|重试生成)$/ }).click()
    const created = await response
    assert.equal(created.status(), 202)
    checkpoint.task = await created.json()
    await save()
  }
  const task = await terminalTask(checkpoint.task.id)
  checkpoint.taskResult = task
  await save()
  assert.equal(task.status, 'READY', task.failureCode ?? 'Real generation failed')
  const events = await api('GET', '/api/v0/tasks/' + task.id + '/events', undefined, 200, { Accept: 'application/json' })
  assert.ok(Array.isArray(events) && JSON.stringify(events).includes('READY'))
  if (!checks.realSseAndReadyTask) await expect.poll(() => sse, { timeout: 5000 }).toBe(true)
  await record('realSseAndReadyTask')
  const application = await api('GET', '/api/v0/applications/' + app.id)
  checkpoint.versionId ??= application.latestReadyVersionId
  const versionId = checkpoint.versionId
  const version = await api('GET', '/api/v0/versions/' + versionId)
  assert.equal(version.status, 'VERIFIED')
  const snapshot = await api('GET', '/api/v0/versions/' + versionId + '/snapshot')
  assert.equal(snapshot.validation.report.buildStatus, 'SUCCEEDED')
  assert.equal(snapshot.validation.report.exitCode, 0)
  assert.equal(snapshot.validation.report.verificationStatus, 'PASSED')
  checkpoint.artifactDigest = snapshot.validation.artifactDigest
  checkpoint.sourceDigest = version.sourceDigest
  await save()
  progress('actual-preview-and-cookie-isolation')
  if (!checks.actualPartitionedPreviewAndSiteIsolation) {
  await page.reload()
  const preview = page.frameLocator('iframe[title="当前版本预览"]')
  await expect(preview.locator('[data-testid="profile-name"]')).toHaveText('Ada Lovelace', { timeout: 20000 })
  const iframe = page.frames().find(frame => new URL(frame.url()).hostname === 'v' + versionId.replaceAll('-', '') + '.preview.codeless-preview.top')
  assert.ok(iframe)
  assert.equal(new URL(iframe.url()).search, '')
  const cookies = await context.cookies()
  const previewCookie = cookies.find(cookie => cookie.name === '__Host-codeless-preview')
  assert.ok(previewCookie?.secure && previewCookie.httpOnly && previewCookie.partitionKey)
  assert.equal(previewCookie.domain, 'v' + versionId.replaceAll('-', '') + '.preview.codeless-preview.top')
  assert.ok(!cookies.some(cookie => cookie.domain.endsWith('codeless-publish.top')))
  await iframe.locator('[data-testid="profile-name"]').screenshot({ path: join(evidence, 'real-preview.png') })
  await record('actualPartitionedPreviewAndSiteIsolation')
  }
  progress('csrf-digest-and-foreign-owner-rejections')
  const payload = { applicationId: app.id, versionId, artifactDigest: checkpoint.artifactDigest }
  const noCsrf = await context.request.post(origin + '/api/v0/publications', { data: payload, headers: { 'Idempotency-Key': randomUUID() } })
  assert.equal(noCsrf.status(), 403)
  await api('POST', '/api/v0/publications', { ...payload, artifactDigest: 'sha256:' + '0'.repeat(64) }, 409, { 'Idempotency-Key': randomUUID() })
  const foreign = await browser.newContext()
  const login = await foreign.request.post(origin + '/api/v0/auth/login', { data: { email: 'admin@codeless.local', password: operator.adminPassword },
    headers: { 'X-CSRF-Token': await csrf(foreign.request) } })
  assert.equal(login.status(), 200)
  await api('POST', '/api/v0/publications', payload, 404, { 'Idempotency-Key': randomUUID() }, foreign.request)
  await foreign.close()
  await record('csrfWrongDigestAndForeignOwnerCannotPublish')
  const failedApplicationId = operator.failedVersionApplicationId ?? app.id
  const failedVersions = await api('GET', '/api/v0/applications/' + failedApplicationId + '/versions?status=FAILED')
  assert.ok(failedVersions.items.length > 0, 'Retained real failed generation must remain nonpublishable')
  await api('POST', '/api/v0/publications', { applicationId: failedApplicationId, versionId: failedVersions.items[0].id,
    artifactDigest: 'sha256:' + '0'.repeat(64) }, 409, { 'Idempotency-Key': randomUUID() })
  await record('realFailedVersionCannotPublish')
  checkpoint.rejectedFailedVersion = { applicationId: failedApplicationId, versionId: failedVersions.items[0].id }
  await save()
  progress('explicit-publish-and-concurrent-edit')
  if (!checkpoint.publication) {
    progress('publish-open-panel')
    await page.getByRole('button', { name: '发布', exact: true }).click()
    const panel = page.getByRole('region', { name: '发布面板' })
    progress('publish-confirm-initially-disabled')
    await expect(panel.getByRole('button', { name: '确认发布', exact: true })).toBeDisabled()
    progress('publish-check-explicit-consent')
    await expect.poll(() => page.getByLabel('我确认公开发布上方版本').isEnabled(), { timeout: 15000 }).toBe(true)
    await page.getByLabel('我确认公开发布上方版本').check()
    progress('publish-submit-confirmed-version')
    const response = page.waitForResponse(value => value.request().method() === 'POST' && new URL(value.url()).pathname === '/api/v0/publications')
    await panel.getByRole('button', { name: '确认发布', exact: true }).click()
    const created = await response
    assert.equal(created.status(), 202)
    checkpoint.publication = await created.json()
    checkpoint.publishIntent = posted
    await save()
    assert.deepEqual(posted.data, payload)
    const edit = await api('POST', '/api/v0/applications/' + app.id + '/edits', { baseVersionId: versionId,
      prompt: '将资料姓名修改为 Hedy Lamarr，保持页面其他结构。', source: { type: 'CHAT' } }, 202, { 'Idempotency-Key': randomUUID() })
    checkpoint.editTask = edit.task
    checkpoint.publicationStatusWhenEditAccepted = (await api('GET', '/api/v0/publications/' + checkpoint.publication.id)).status
    await save()
  }
  assertConcurrentEditCheckpoint(checkpoint)
  const publication = await terminalPublication(checkpoint.publication.id)
  checkpoint.publication = publication
  await save()
  assert.equal(publication.status, 'PUBLISHED')
  assert.equal(publication.versionId, versionId)
  const replay = await api('POST', '/api/v0/publications', checkpoint.publishIntent.data, 202,
    { 'Idempotency-Key': checkpoint.publishIntent.key })
  assert.equal(replay.id, publication.id)
  await record('explicitPublishAndIdempotentReplay')
  progress('public-bytes-routes-and-denials')
  const manifests = snapshot.validation.artifact.files.filter(file => file.path === 'index.html' || /^assets\/[A-Za-z0-9_-]+\.(js|css|svg|png|jpg|jpeg|webp|ico|woff|woff2)$/.test(file.path))
  assert.ok(manifests.length >= 2)
  for (const file of manifests) {
    const response = await context.request.get(new URL(file.path, publication.url).href)
    assert.equal(response.status(), 200)
    const bytes = await response.body()
    assert.equal(bytes.length, file.bytes)
    assert.equal(hash(bytes), file.digest)
  }
  checkpoint.publishedFiles = manifests
  for (const path of ['/', '/tasks', '/catalog']) assert.equal((await context.request.get(new URL(path, publication.url).href)).status(), 200)
  for (const path of ['/assets/missing.js', '/src/pages/HomePage.vue', '/assets/index.js.map', '/.git/config', '/__deployment.json', '/ai-component-catalog.json', '/api/v0/auth/csrf', '/assets/'])
    assert.equal((await context.request.get(new URL(path, publication.url).href)).status(), 404)
  assert.equal((await context.request.post(publication.url, { data: 'denied' })).status(), 405)
  const publicPage = await context.newPage()
  await publicPage.goto(publication.url)
  await expect(publicPage.locator('[data-testid="profile-name"]')).toHaveText('Ada Lovelace')
  await publicPage.screenshot({ path: join(evidence, 'published-page.png'), fullPage: true })
  await publicPage.reload()
  await expect(publicPage.locator('[data-testid="profile-name"]')).toHaveText('Ada Lovelace')
  await record('publicManifestBytesRoutesRefreshAndPrivatePaths')
  progress('edited-version-does-not-change-published-content')
  const edited = await terminalTask(checkpoint.editTask.id)
  checkpoint.editTaskResult = edited
  await save()
  assert.equal(edited.status, 'READY', edited.failureCode ?? 'Real edit failed')
  const afterEdit = await api('GET', '/api/v0/applications/' + app.id)
  assert.notEqual(afterEdit.latestReadyVersionId, versionId)
  const newSnapshot = await api('GET', '/api/v0/versions/' + afterEdit.latestReadyVersionId + '/snapshot')
  assert.notEqual(newSnapshot.sourceDigest, snapshot.sourceDigest)
  assert.equal((await api('GET', '/api/v0/versions/' + versionId + '/snapshot')).validation.artifactDigest, checkpoint.artifactDigest)
  await publicPage.reload()
  await expect(publicPage.locator('[data-testid="profile-name"]')).toHaveText('Ada Lovelace')
  checkpoint.editedVersionId = afterEdit.latestReadyVersionId
  await record('editingRetainsExactPublishedVersionAndBytes')
  progress('probe-failure-retains-old-success')
  if (!checkpoint.failedPublication) {
    await writeFile(join(evidence, 'failure-plan.json'), JSON.stringify({ versionId: afterEdit.latestReadyVersionId,
      oldPublicationId: publication.id, applicationId: app.id }))
    await expect.poll(async () => { try { return JSON.parse(await readFile(join(evidence, 'failure-armed.json'), 'utf8')).armed } catch { return false } }, { timeout: 10000 }).toBe(true)
    await page.reload()
    await page.getByRole('button', { name: '发布', exact: true }).click()
    await page.getByLabel('我确认公开发布上方版本').check()
    const response = page.waitForResponse(value => value.request().method() === 'POST' && new URL(value.url()).pathname === '/api/v0/publications')
    await page.getByRole('region', { name: '发布面板' }).getByRole('button', { name: '确认发布', exact: true }).click()
    const received = await response
    assert.equal(received.status(), 202)
    checkpoint.failedPublication = await received.json()
    await save()
  }
  const failed = await terminalPublication(checkpoint.failedPublication.id)
  checkpoint.failedPublication = failed
  await save()
  assert.equal(failed.status, 'FAILED')
  const list = await api('GET', '/api/v0/applications/' + app.id + '/publications')
  assert.equal(list.latestSuccessful.id, publication.id)
  assert.equal(list.items.filter(item => item.id === publication.id).length, 1)
  await publicPage.reload()
  await expect(publicPage.locator('[data-testid="profile-name"]')).toHaveText('Ada Lovelace')
  await page.reload()
  await page.getByRole('button', { name: '发布', exact: true }).click()
  await expect(page.getByRole('region', { name: '发布面板' }).getByRole('link', { name: publication.url })).toHaveAttribute('href', publication.url)
  await page.screenshot({ path: join(evidence, 'failed-probe-keeps-success.png'), fullPage: true })
  await record('realProbeFailureAndColdSessionRetainOldSuccess')
  const successDeployment = await api('GET', '/api/v0/publications/' + publication.id + '/deployment')
  const failedDeployment = await api('GET', '/api/v0/publications/' + failed.id + '/deployment')
  assert.equal(successDeployment.phase, 'SUCCEEDED')
  assert.equal(failedDeployment.phase, 'FAILED')
  assert.equal(failedDeployment.failureCode, 'DEPLOYMENT_PROBE_FAILED')
  assert.equal(failedDeployment.latestSuccessful.id, publication.id)
  const result = { status: 'PASSED', authenticatedPublicFlow: true, fixtureApi: false, fixtureSigning: false,
    modelProvider: 'deterministic-mock', modelQualityAccepted: false, origin, applicationId: app.id, taskId: task.id,
    versionId, sourceDigest: checkpoint.sourceDigest, artifactDigest: checkpoint.artifactDigest, publication,
    editedVersionId: checkpoint.editedVersionId, failedPublication: failed, checks, publishedFiles: manifests,
    rejectedFailedVersion: checkpoint.rejectedFailedVersion,
    publicationStatusWhenEditAccepted: checkpoint.publicationStatusWhenEditAccepted,
    successDeployment, failedDeployment, publicMilestoneReached: false,
    note: 'Awaiting independent external published-page verification and SQL/operator checks.' }
  await writeFile(join(evidence, 'acceptance.json'), JSON.stringify(result, null, 2))
  // Explicit public proof contains only IDs, hashes, URLs and check results: no sessions,
  // credentials, request headers, model input or private failure text.
  if (process.argv[3]) await writeFile(process.argv[3], JSON.stringify(result, null, 2))
  console.log(JSON.stringify({ status: 'PASSED', applicationId: app.id, publicationUrl: publication.url, checks }))
} catch (error) {
  if (page) {
    const panel = page.getByRole('region', { name: '发布面板' })
    const text = await panel.textContent({ timeout: 1000 }).catch(() => '')
    console.error(JSON.stringify({ publicUiFlags: {
      panelVisible: await panel.isVisible().catch(() => false),
      unavailableOrigin: text.includes('公开站点尚未配置'),
      loadingVersion: text.includes('正在核对待发布版本'),
      noVerifiedVersion: text.includes('暂无可发布的已验证版本'),
      unverifiedVersion: text.includes('未通过验证'),
      unknownSubmission: text.includes('提交结果未知'),
      snapshotRejected: text.includes('无法确认此版本的冻结构建产物'),
    } }))
  }
  await writeFile(join(evidence, 'failure-private.txt'), String(error.stack ?? error))
  if (page) await page.screenshot({ path: join(evidence, 'failure-private.png'), fullPage: true }).catch(() => {})
  console.error(JSON.stringify({ status: 'FAILED', stage, errorType: error.name, detail: 'Server-private failure file retained; no credentials exported.' }))
  process.exitCode = 1
} finally {
  await context?.close()
  await browser?.close()
}
