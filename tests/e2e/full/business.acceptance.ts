import { expect, test, type Page, type BrowserContext } from '@playwright/test'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { verify, sha } from '../../export/verify-export.mjs'
import { readZip } from '../../export/zip-reader.mjs'

const output = process.env.CODELESS_FULL_OUTPUT!
const frame = (page: Page) => page.frameLocator('iframe[title="当前版本预览"]')
async function call(page: Page, path: string, method = 'GET', body?: unknown, key?: string) {
  return page.evaluate(async ({ path, method, body, key }) => {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (!['GET', 'HEAD'].includes(method)) {
      const csrf = await fetch('/api/v0/auth/csrf')
      if (csrf.status !== 200) throw new Error('CSRF HTTP ' + csrf.status)
      headers['X-CSRF-Token'] = (await csrf.json()).token
    }
    if (key) headers['Idempotency-Key'] = key
    const response = await fetch('/api/v0/' + path, { method, headers, ...(body ? { body: JSON.stringify(body) } : {}) })
    const type = response.headers.get('content-type') ?? ''
    if (!type.includes('application/json')) throw new Error('Expected JSON: ' + path + ' HTTP ' + response.status)
    return { status: response.status, body: await response.json() }
  }, { path, method, body, key })
}
async function get(page: Page, path: string) {
  const result = await call(page, path); expect(result.status, path).toBe(200); return result.body
}
async function terminal(page: Page, id: string, expected = 'READY') {
  let state: any
  await expect.poll(async () => {
    state = await get(page, 'tasks/' + id)
    return ['READY', 'FAILED'].includes(state.status) ? state.status : 'RUNNING'
  }, { timeout: 60_000, intervals: [200, 500, 1000], message: 'Real task ' + id + ' terminal state' }).toBe(expected)
  return state
}
type Actor = { page: Page; context: BrowserContext; app: string; generation: string; original: string; edited?: string; edit?: string; publication?: any; downloadDigest?: string }

test('D20-B T1–T4: two isolated users generate, reconnect, edit, publish, download and retain a usable version after real failure', async ({ browser }, info) => {
  const actors: Actor[] = [], ids: Record<string, unknown> = { task: 'D20-B', test: info.title, retry: info.retry, actors: [] }
  const contexts: BrowserContext[] = []
  let primaryError: unknown
  const persist = async () => {
    ids.actors = actors.map(({ page: _page, context: _context, ...identity }) => identity)
    await writeFile(join(output, 'identities.json'), JSON.stringify(ids, null, 2))
  }
  // Explicitly create two sessions; never reuse storageState/cookies between users.
  try {
    for (const [index, email] of ['demo@codeless.local', 'second@codeless.local'].entries()) {
      const context = await browser.newContext({ baseURL: process.env.CODELESS_FULL_ORIGIN,
        ignoreHTTPSErrors: true, viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block',
        proxy: { server: 'http://127.0.0.1:9', bypass: '*.test,127.0.0.1' } })
      contexts.push(context)
      // Only loopback fixtures can be reached by this browser. No responses are mocked.
      await context.route('**/*', route => {
        const url = new URL(route.request().url())
        return url.protocol === 'https:' && (url.hostname === 'platform.codeless.test' ||
          /^v[0-9a-f]{32}\.preview\.codeless-preview\.test$/.test(url.hostname) ||
          /^d[0-9a-f]{32}\.sites\.codeless-public\.test$/.test(url.hostname)) ? route.continue() : route.abort()
      })
      // Playwright's runner traces every browser.newContext, including both users.
      const page = await context.newPage()
      await page.goto('/login')
      await page.getByLabel('邮箱').fill(email); await page.getByLabel('密码').fill('demo-password-for-test-only')
      await page.getByRole('button', { name: '登录', exact: true }).click(); await expect(page).toHaveURL(/\/apps$/)
      await expect(page.locator('.project-card')).toHaveCount(0)
      await page.getByRole('button', { name: '新建应用', exact: true }).first().click()
      await page.getByLabel('应用名称').fill('D20 user ' + (index + 1))
      await page.getByLabel('数据模式').selectOption('STATIC')
      await page.getByRole('button', { name: '创建', exact: true }).click()
      await expect(page).toHaveURL(/\/workbench\/[0-9a-f-]+$/)
      const app = new URL(page.url()).pathname.split('/').at(-1)!
      await page.getByLabel('需求描述').fill('生成静态 Ada Lovelace 个人展示页及作品列表')
      const accepted = page.waitForResponse(r => new URL(r.url()).pathname === '/api/v0/tasks' && r.request().method() === 'POST')
      await page.getByRole('button', { name: '开始生成', exact: true }).click()
      const response = await accepted; expect(response.status()).toBe(202)
      const generation = (await response.json()).id
      const actor: Actor = { page, context, app, generation, original: '' }; actors.push(actor); await persist()
      if (index === 0) {
        // submit() persists the recovery URL through an authenticated router guard.
        // Disconnect only after that navigation has completed, not during auth/me.
        await expect(page).toHaveURL(url => url.searchParams.get('taskId') === generation)
        await expect(page.locator('.task-status')).toContainText(generation)
        await expect(page.getByRole('button', { name: '刷新任务', exact: true })).toBeEnabled()
        await context.setOffline(true)
        await page.getByRole('button', { name: '刷新任务', exact: true }).click()
        await expect(page.locator('.workbench-task')).toContainText(/网络|连接/)
        await expect(page.locator('.task-status')).not.toContainText('生成失败')
        await context.setOffline(false)
        await page.getByRole('button', { name: '刷新任务', exact: true }).click()
        ids.offlineReconnect = { taskId: generation, actualBrowserOffline: true, manualRefresh: true }
      }
      await terminal(page, generation)
      actor.original = (await get(page, 'applications/' + app)).latestReadyVersionId; await persist()
      await expect(frame(page).getByTestId('profile-name')).toHaveText('Ada Lovelace', { timeout: 30_000 })
      if (process.env.CODELESS_FULL_INJECT_ASSERTION === '1') expect('intentional failure after verified generation', 'D20 failure-artifact canary').toBe('must fail')
      expect((await get(page, 'applications/' + app + '/publications')).items).toHaveLength(0)

      await page.getByLabel('选择组件进行修改').check()
      await frame(page).getByTestId('profile-name').click()
      await page.getByLabel('组件修改描述').fill('将姓名改为 Hedy Lamarr，修改整个共享组件')
      await page.getByLabel('我确认修改影响整个源码组件及所有共享实例').check()
      const editing = page.waitForResponse(r => new URL(r.url()).pathname.endsWith('/component-edits') && r.request().method() === 'POST')
      await page.getByRole('button', { name: '创建组件修改', exact: true }).click()
      const editResponse = await editing; expect(editResponse.status()).toBe(202)
      actor.edit = (await editResponse.json()).task.id; await persist()
      await terminal(page, actor.edit!)
      actor.edited = (await get(page, 'applications/' + app)).latestReadyVersionId
      expect(actor.edited).not.toBe(actor.original); await persist()
      await expect(frame(page).getByTestId('profile-name')).toHaveText('Hedy Lamarr', { timeout: 30_000 })
      expect((await get(page, 'applications/' + app + '/publications')).items).toHaveLength(0)

      await page.getByRole('button', { name: '发布', exact: true }).click()
      const panel = page.getByRole('region', { name: '发布面板' })
      // Offline discovery is deliberately fail-closed. A real user explicitly
      // reconciles server records before making a new publication intent.
      await panel.getByRole('button', { name: '重新读取版本与发布记录', exact: true }).click()
      await expect(panel).toContainText(actor.edited!)
      await page.getByLabel('我确认公开发布上方版本').check()
      const publishing = page.waitForResponse(r => new URL(r.url()).pathname === '/api/v0/publications' && r.request().method() === 'POST')
      await page.getByRole('button', { name: '确认发布', exact: true }).click()
      const publishResponse = await publishing; expect(publishResponse.status()).toBe(202)
      actor.publication = await publishResponse.json(); await persist()
      await expect.poll(async () => (await get(page, 'publications/' + actor.publication.id)).status, { timeout: 30_000 }).toBe('PUBLISHED')
      await page.getByRole('button', { name: '刷新发布状态', exact: true }).click()
      await expect(panel.getByRole('link')).toBeVisible()
      actor.publication = await get(page, 'publications/' + actor.publication.id)
      const deployed = await get(page, 'publications/' + actor.publication.id + '/deployment')
      expect(deployed.phase).toBe('SUCCEEDED'); expect(actor.publication.versionId).toBe(actor.edited)
      const publicPage = await context.newPage()
      expect((await publicPage.goto(actor.publication.url)).status()).toBe(200)
      await expect(publicPage.getByTestId('profile-name')).toHaveText('Hedy Lamarr')
      await publicPage.reload(); await expect(publicPage.getByTestId('profile-name')).toHaveText('Hedy Lamarr')
      await publicPage.close()
      const selected = await get(page, 'versions/' + actor.edited)
      const downloading = page.waitForEvent('download')
      await panel.getByRole('button', { name: '下载源码 · v' + selected.number, exact: true }).click()
      const download = await downloading
      expect(download.suggestedFilename()).toBe('codeless-' + actor.edited + '.zip')
      const zip = await readFile((await download.path())!)
      expect(readZip(zip).find((file: any) => file.name.endsWith('/src/components/ProfileCard.vue'))!.data.toString('utf8')).toContain('Hedy Lamarr')
      const validation = verify(zip, { versionId: actor.edited, sourceDigest: selected.sourceDigest, artifactDigest: deployed.artifactDigest,
        forbiddenStrings: ['demo-password-for-test-only', 'fixture-only-d20'] })
      expect(validation.status, JSON.stringify(validation.failures)).toBe('PASSED')
      actor.downloadDigest = sha(zip)
      await writeFile(join(output, `user-${index + 1}-export.json`), JSON.stringify(validation, null, 2))
      await download.saveAs(join(output, `user-${index + 1}.zip`))
      await page.getByRole('button', { name: '关闭发布面板' }).click()
      await page.screenshot({ path: join(output, `user-${index + 1}-complete.png`), fullPage: true }); await persist()
    }

    const [a, b] = actors
    expect(a.app).not.toBe(b.app)
    expect(a.original).not.toBe(b.original); expect(a.edited).not.toBe(b.edited)
    // Same deterministic source bytes still have separate owner/version/task identities.
    ids.crossUser = []
    for (const [reader, foreign] of [[a, b], [b, a]]) {
      const denied: unknown[] = []
      for (const path of ['applications/' + foreign.app, 'tasks/' + foreign.generation, 'tasks/' + foreign.generation + '/events',
        'versions/' + foreign.edited, 'versions/' + foreign.edited + '/snapshot', 'versions/' + foreign.edited + '/export',
        'publications/' + foreign.publication.id, 'publications/' + foreign.publication.id + '/deployment']) {
        const result = await call(reader.page, path); expect(result.status, path).toBe(404); denied.push({ path, status: result.status })
      }
      expect((await call(reader.page, 'applications/' + foreign.app + '/edits', 'POST', { baseVersionId: foreign.edited, prompt: 'forbidden', source: { type: 'CHAT' } }, randomUUID())).status).toBe(404)
      expect((await call(reader.page, 'publications', 'POST', { applicationId: foreign.app, versionId: foreign.edited, artifactDigest: 'sha256:' + '0'.repeat(64) }, randomUUID())).status).toBe(404)
      const listed = await get(reader.page, 'applications'); expect(listed.items.map((v: any) => v.id)).toEqual([reader.app])
      ;(ids.crossUser as unknown[]).push({ readerApplication: reader.app, denied })
    }

    const stale = await call(a.page, 'applications/' + a.app + '/edits', 'POST', { baseVersionId: a.original, prompt: '过期版本修改', source: { type: 'CHAT' } }, randomUUID())
    expect(stale.status).toBe(409); expect(stale.body.code).toBe('EDIT_VERSION_CONFLICT')
    const wrong = await call(a.page, 'publications', 'POST', { applicationId: a.app, versionId: a.edited, artifactDigest: 'sha256:' + '0'.repeat(64) }, randomUUID())
    expect(wrong.status).toBe(409)
    expect((await call(a.page, 'versions/' + randomUUID() + '/export')).status).toBe(404)
    ids.wrongVersion = { stale: stale.status, staleCode: stale.body.code, mismatchedArtifact: wrong.status }

    // Actual compilation fails; SQL and UI must keep the latest usable version.
    await a.page.getByLabel('选择组件进行修改').check()
    await frame(a.page).getByTestId('profile-name').click()
    await a.page.getByLabel('组件修改描述').fill('D20_BUILD_FAILURE 生成明确的语法错误用于构建失败测试')
    await a.page.getByLabel('我确认修改影响整个源码组件及所有共享实例').check()
    const failing = a.page.waitForResponse(r => new URL(r.url()).pathname.endsWith('/component-edits') && r.request().method() === 'POST')
    await a.page.getByRole('button', { name: '创建组件修改', exact: true }).click()
    const failedResponse = await failing; expect(failedResponse.status()).toBe(202)
    const failedTask = (await failedResponse.json()).task.id
    ids.failedTaskId = failedTask; await persist()
    const failure = await terminal(a.page, failedTask, 'FAILED')
    expect(failure.failureCode).toBe('AGENT_BUILD_EXIT')
    await expect(a.page.getByRole('region', { name: '组件修改任务', exact: true })).toContainText('旧版本仍可用')
    expect((await get(a.page, 'applications/' + a.app)).latestReadyVersionId).toBe(a.edited)
    await expect(frame(a.page).getByTestId('profile-name')).toHaveText('Hedy Lamarr')
    const versions = await get(a.page, 'applications/' + a.app + '/versions')
    const failed = versions.items.find((v: any) => v.status === 'FAILED')
    expect(failed).toBeTruthy()
    expect((await call(a.page, 'versions/' + failed.id + '/export')).status).toBe(409)
    expect((await call(a.page, 'publications', 'POST', { applicationId: a.app, versionId: failed.id, artifactDigest: 'sha256:' + '0'.repeat(64) }, randomUUID())).status).toBe(409)
    expect((await get(a.page, 'applications/' + a.app + '/publications')).latestSuccessful.id).toBe(a.publication.id)
    await a.page.reload(); await expect(frame(a.page).getByTestId('profile-name')).toHaveText('Hedy Lamarr', { timeout: 30_000 })
    const usable = await get(a.page, 'versions/' + a.edited)
    const usableDownload = a.page.waitForEvent('download')
    await a.page.getByRole('region', { name: '只读源码' }).getByRole('button', { name: '下载源码 · v' + usable.number, exact: true }).click()
    expect(sha(await readFile((await (await usableDownload).path())!))).toBe(a.downloadDigest)
    const publicPage = await a.context.newPage()
    await publicPage.goto(a.publication.url); await expect(publicPage.getByTestId('profile-name')).toHaveText('Hedy Lamarr'); await publicPage.close()
    // Historical version download uses its own source and must retain Ada after edit/failure.
    const original = await get(a.page, 'versions/' + a.original)
    await a.page.locator(`[data-version-id="${a.original}"]`).getByRole('button').click()
    const source = a.page.getByRole('region', { name: '只读源码' })
    const downloading = a.page.waitForEvent('download')
    await source.getByRole('button', { name: '下载源码 · v' + original.number, exact: true }).click()
    const download = await downloading, historical = await readFile((await download.path())!)
    expect(readZip(historical).find((file: any) => file.name.endsWith('/src/components/ProfileCard.vue'))!.data.toString('utf8')).toContain('Ada Lovelace')
    const historicalValidation = verify(historical, { versionId: a.original, sourceDigest: original.sourceDigest })
    expect(historicalValidation.status).toBe('PASSED')
    await writeFile(join(output, 'historical-export.json'), JSON.stringify(historicalValidation, null, 2))
    await download.saveAs(join(output, 'historical.zip'))
    // One explicit transport corruption: a real ZIP with a foreign version header must never download.
    const downloads: string[] = []; a.page.on('download', value => downloads.push(value.suggestedFilename()))
    await a.page.route('**/api/v0/versions/' + a.original + '/export', route => route.fulfill({ contentType: 'application/zip', body: historical,
      headers: { 'X-CodeLess-Version-Id': b.edited!, 'X-CodeLess-Source-Digest': original.sourceDigest } }))
    await source.getByRole('button', { name: '下载源码 · v' + original.number, exact: true }).click()
    await expect(source.getByRole('alert')).toContainText('已停止下载'); expect(downloads).toEqual([])
    await a.page.unroute('**/api/v0/versions/' + a.original + '/export')
    ids.failurePreservesVersion = { failedTaskId: failedTask, failureCode: failure.failureCode, failedVersionId: failed.id,
      latestReadyVersionId: a.edited, latestSuccessfulPublication: a.publication.id, historicalVersionId: a.original, wrongDownloadBlocked: true }
    await a.page.screenshot({ path: join(output, 'failed-edit-keeps-old-version.png'), fullPage: true })
    await persist()
    await info.attach('task-version-publication-identities', { path: join(output, 'identities.json'), contentType: 'application/json' })
  } catch (error) {
    primaryError = error
    ids.failure = error instanceof Error ? error.stack : String(error)
    await persist()
    ids.screenshotErrors = []
    for (const [index, context] of contexts.entries()) {
      await context.setOffline(false).catch(() => {})
      for (const [pageIndex, page] of context.pages().entries()) if (!page.isClosed()) {
        try { await page.screenshot({ path: join(output, `failure-user-${index + 1}-page-${pageIndex + 1}.png`), fullPage: true, timeout: 5000 }) }
        catch (screenshotError) { (ids.screenshotErrors as unknown[]).push(String(screenshotError)) }
      }
    }
    await persist()
    throw error
  } finally {
    const cleanupErrors = []
    for (const context of contexts) try { await context.close() } catch (error) { cleanupErrors.push(String(error)) }
    ids.contextCleanupErrors = cleanupErrors; await persist()
    if (cleanupErrors.length && !primaryError) throw new Error('Browser context cleanup failed: ' + cleanupErrors.join('; '))
  }
})
