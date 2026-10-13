import { expect, test, type Page } from '@playwright/test'
import { renderPreviewSelector } from '../../../templates/vue/preview-bridge/selector.mjs'
import { installVersionsFixture, openWorkbench, ids, versions } from '../versions/fixture'

// API and generated markup are named contract fixtures; platform UI and bridge run in real Chromium.
const versionId = ids[1], sourceDigest = versions[1].sourceDigest
const origin = `https://v${versionId.replaceAll('-', '')}.preview.codeless-preview.test`
const component = { componentId: 'shared-card', sourceFile: 'src/components/SharedCard.vue', fileDigest: 'sha256:' + 'a'.repeat(64), scope: 'SOURCE_FILE' }
async function fixture(page: Page) {
  await installVersionsFixture(page)
  const requests: object[] = []
  await page.route('**/component-mapping', route => route.fulfill({ json: { protocol: 'codeless-component-mapping/v1', versionId, sourceDigest, components: [component], disabled: [] } }))
  await page.route('**/component-selection', route => {
    const candidate = route.request().postDataJSON(); requests.push(candidate)
    return route.fulfill({ json: { ...component, ...candidate, selectable: true, shared: true, notice: '修改影响整个组件源码及所有实例。' } })
  })
  await page.route('https://*.preview.codeless-preview.test/**', route => route.fulfill({ contentType: 'text/html; charset=utf-8', body: `<!doctype html><head><meta charset="utf-8"><script>
    window.commands=[];addEventListener('message',e=>{if(e.data?.protocol==='codeless-selector/v1')window.commands.push(e.data)});
    ${renderPreviewSelector({ platformOrigin: 'http://127.0.0.1:4173', versionId, sourceDigest })}
    addEventListener('load',()=>parent.postMessage({type:'codeless-preview',state:'loaded'},'http://127.0.0.1:4173'));
    </script></head><body><main data-ai-component="home-page"><section data-ai-component="shared-card"><a href="#destination"><span><strong>嵌套链接一</strong></span></a></section>
    <section><article data-ai-component="shared-card"><a href="#destination"><span>共享链接二</span></a></article></section>
    <article data-ai-component="shared-card"><p>共享三</p></article></main><aside>空白区域</aside><div id="destination">导航目标</div>
    <script>window.clicks=0;document.querySelector('a').addEventListener('click',()=>window.clicks++);</script></body>` }))
  await openWorkbench(page)
  await expect(page.getByLabel('选择组件进行修改')).toBeEnabled()
  return { requests, frame: page.frameLocator('iframe[title="当前版本预览"]') }
}
test('D13-B-T1/T3: hover nested component, select/cancel, Esc and restored navigation', async ({ page }, info) => {
  const { requests, frame } = await fixture(page)
  await frame.getByText('嵌套链接一').click()
  await expect.poll(() => frame.locator('body').evaluate(() => location.hash)).toBe('#destination')
  await page.getByLabel('选择组件进行修改').check()
  await frame.getByText('嵌套链接一').hover()
  await expect(frame.locator('[data-codeless-selector-overlay]')).toBeVisible()
  await frame.getByText('嵌套链接一').click()
  await expect(page.getByRole('region', { name: '组件修改' })).toContainText(component.sourceFile)
  expect(requests[0]).toEqual({ componentId: 'shared-card', versionId, sourceDigest })
  expect(await frame.locator('body').evaluate(() => (window as unknown as { clicks: number }).clicks)).toBe(1)
  await page.getByRole('button', { name: '取消选择', exact: true }).click()
  await expect(page.getByLabel('组件修改描述')).toHaveCount(0)
  await expect(frame.locator('[data-codeless-selector-overlay]')).toHaveCount(0)
  await frame.getByText('嵌套链接一').click()
  await frame.getByText('嵌套链接一').press('Escape')
  await expect(page.getByLabel('选择组件进行修改')).not.toBeChecked()
  await expect(frame.locator('[data-codeless-selector-overlay]')).toHaveCount(0)
  await frame.locator('body').evaluate(() => { location.hash = '' })
  await frame.getByText('嵌套链接一').click()
  await expect.poll(() => frame.locator('body').evaluate(() => location.hash)).toBe('#destination')
  await page.getByLabel('选择组件进行修改').check()
  await page.getByLabel('选择组件进行修改').press('Escape')
  await expect(page.getByLabel('选择组件进行修改')).not.toBeChecked()
  await info.attach('T1-T3-api-projection', { body: JSON.stringify(requests), contentType: 'application/json' })
})
test('D13-B-T4: repeated instances share one source file and show whole-component scope', async ({ page }, info) => {
  const { frame } = await fixture(page)
  await page.getByLabel('选择组件进行修改').check()
  await frame.getByText('共享链接二').click()
  await expect(page.getByRole('region', { name: '预览组件选择' })).toContainText('第 2 / 3 个已渲染实例')
  await expect(page.getByRole('region', { name: '预览组件选择' })).toContainText('所有共享实例，包括其他页面')
  await expect(page.getByRole('region', { name: '组件修改' })).toContainText(component.sourceFile)
  const sidebarBox = await page.getByRole('region', { name: '预览组件选择' }).boundingBox()
  const frameBox = await page.locator('iframe[title="当前版本预览"]').boundingBox()
  expect(sidebarBox!.x).toBeGreaterThanOrEqual(frameBox!.x + frameBox!.width - 1)
  await page.screenshot({ path: info.outputPath('T4-shared.png'), fullPage: true })
  await page.setViewportSize({ width: 375, height: 900 })
  await expect(page.getByRole('region', { name: '预览组件选择' })).toContainText('所有共享实例')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true)
  // Scroll the parent first: offscreen cross-origin frames may pause animation frames.
  await page.locator('iframe[title="当前版本预览"]').scrollIntoViewIfNeeded()
  await expect(frame.getByText('共享链接二')).toBeVisible()
  await page.locator('.preview-panel').screenshot({ path: info.outputPath('T4-shared-mobile.png') })
})
test('D13-B-T2: both endpoints reject forged source/origin, nonce/version/schema and old-session replay', async ({ page }, info) => {
  const { requests, frame } = await fixture(page)
  await page.getByLabel('选择组件进行修改').check()
  const command = await frame.locator('body').evaluate(() => (window as unknown as { commands: Record<string, unknown>[] }).commands.findLast(item => item.type === 'mode'))
  expect(command).toBeTruthy()
  const base = { ...command }; delete base.enabled
  const selection = { ...base, type: 'selection', componentId: 'shared-card', instance: { index: 1, count: 3 } }
  const rejected = [ { origin: origin + '.evil' }, { wrongSource: true }, { patch: { nonce: '11111111-1111-4111-8111-111111111111' } },
    { patch: { versionId: ids[0] } }, { patch: { sourceDigest: 'sha256:' + 'b'.repeat(64) } }, { patch: { sourceFile: component.sourceFile } },
    { patch: { instance: { index: 4, count: 3 } } }, { patch: { componentId: 'shared-card\n' } } ]
  await page.evaluate(({ selection, rejected, origin }) => {
    for (const attempt of rejected) window.dispatchEvent(new MessageEvent('message', { origin: attempt.origin ?? origin,
      source: attempt.wrongSource ? window : document.querySelector('iframe')!.contentWindow, data: { ...selection, ...attempt.patch } }))
  }, { selection, rejected, origin })
  // A native same-origin message from a second preview has the wrong WindowProxy.
  await page.evaluate(() => {
    const sibling = document.createElement('iframe'); sibling.id = 'forged-preview'
    sibling.src = document.querySelector<HTMLIFrameElement>('iframe[title="当前版本预览"]')!.src
    document.body.append(sibling)
  })
  await page.frameLocator('#forged-preview').getByText('共享三').evaluate((_node, selection) => parent.postMessage(selection, 'http://127.0.0.1:4173'), selection)
  await page.evaluate(selection => postMessage(selection, location.origin), selection)
  await page.locator('#forged-preview').evaluate(node => node.remove())
  // Flush the event loop with a genuine valid selection, proving negative messages caused no API request.
  await frame.getByText('共享链接二').click()
  await expect(page.getByLabel('组件修改描述')).toBeVisible()
  expect(requests).toHaveLength(1)
  await page.getByLabel('选择组件进行修改').uncheck()
  // Preview rejects wrong nonce/version/schema, a real self-message and a real sibling-window message.
  await frame.locator('body').evaluate(({ command, version }) => {
    const valid = { ...command, enabled: true }
    for (const patch of [{ nonce: 'bad' }, { versionId: version }, { sourceFile: 'fake.vue' }, { enabled: 'true' }])
      dispatchEvent(new MessageEvent('message', { source: parent, origin: 'http://127.0.0.1:4173', data: { ...valid, ...patch } }))
    postMessage(valid, location.origin)
  }, { command, version: ids[0] })
  await page.evaluate(({ command, origin }) => {
    const sibling = document.createElement('iframe'); sibling.srcdoc = '<p>sibling</p>'; sibling.id = 'attacker'; document.body.append(sibling)
    sibling.contentWindow!.eval(`parent.document.querySelector('iframe').contentWindow.postMessage(${JSON.stringify({ ...command, enabled: true })}, ${JSON.stringify(origin)})`)
  }, { command, origin })
  await frame.locator('body').evaluate(() => { location.hash = '' })
  await frame.getByText('嵌套链接一').click()
  await expect.poll(() => frame.locator('body').evaluate(() => location.hash)).toBe('#destination')
  await page.locator('#attacker').evaluate(node => node.remove())
  await page.getByRole('button', { name: '刷新预览', exact: true }).click()
  await expect(page.getByLabel('选择组件进行修改')).toBeEnabled()
  await page.getByLabel('选择组件进行修改').check()
  await page.evaluate(({ selection, origin }) => window.dispatchEvent(new MessageEvent('message', { origin, source: document.querySelector('iframe')!.contentWindow, data: selection })), { selection, origin })
  await frame.getByText('共享链接二').click()
  await expect(page.getByLabel('组件修改描述')).toBeVisible()
  expect(requests).toHaveLength(2)
  await info.attach('T2-rejected-cases', { body: JSON.stringify({ hostNegativeCases: rejected, previewNegativeCases: 6, oldSessionReplay: true, acceptedRequests: requests }), contentType: 'application/json' })
})
