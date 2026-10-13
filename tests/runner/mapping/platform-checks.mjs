import assert from 'node:assert/strict'
import { expect } from '@playwright/test'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { validateManifest, resolveSelection } from '../../../services/runner/src/mapping/manifest.mjs'

// Actual authenticated platform, immutable snapshot, preview gateway and browser.
// No intercepted API, forged postMessage or simulated source/build is accepted here.
export async function checkComponentPlatform({ page, call, app, version, evidence }) {
  const frame = page.frameLocator('iframe')
  const mapping = await call(`versions/${version}/component-mapping`)
  assert.equal(mapping.status, 200); validateManifest(mapping.body)
  const selected = resolveSelection(mapping.body, { versionId: version, sourceDigest: mapping.body.sourceDigest, componentId: 'profile-card' })
  assert.equal(selected.selectable, true)
  const read = await call(`versions/${version}/files/content?path=${selected.sourceFile}`)
  assert.equal(read.status, 200); assert.equal(read.body.digest, selected.fileDigest)
  await expect(page.getByLabel('选择组件进行修改')).toBeEnabled()
  await page.getByLabel('选择组件进行修改').check()
  await frame.getByTestId('profile-name').click()
  await expect(page.getByRole('region', { name: '组件修改' })).toContainText('profile-card')
  await expect(page.getByRole('region', { name: '组件修改' })).toContainText(selected.sourceFile)
  await expect(page.getByRole('region', { name: '组件修改' })).toContainText('所有实例')
  await page.getByLabel('组件修改描述').fill('将共享资料人物改为 Hedy Lamarr')
  const accepted = page.waitForResponse(r => new URL(r.url()).pathname === `/api/v0/applications/${app}/component-edits` && r.request().method() === 'POST')
  await page.getByRole('button', { name: '创建组件修改', exact: true }).click()
  const response = await accepted
  assert.equal(response.status(), 202)
  const edit = await response.json()
  const sent = response.request().postDataJSON()
  assert.deepEqual(Object.keys(sent.selection).sort(), ['componentId', 'sourceDigest', 'versionId'])
  assert.equal(edit.source.sourceFile, selected.sourceFile)
  const task = edit.task.id, deadline = Date.now() + 90000
  let taskState
  do {
    const state = await call(`tasks/${task}`); assert.equal(state.status, 200); taskState = state.body
    assert.notEqual(taskState.status, 'FAILED', taskState.failureCode)
    if (taskState.status === 'READY') break
    assert(Date.now() < deadline, 'Component edit did not reach real READY')
    await new Promise(done => setTimeout(done, 300))
  } while (true)
  await expect(page.frameLocator('iframe').getByTestId('profile-name')).toHaveText('Hedy Lamarr', { timeout: 30000 })
  const application = await call(`applications/${app}`)
  const next = application.body.latestReadyVersionId; assert.notEqual(next, version)
  const nextMapping = await call(`versions/${next}/component-mapping`); assert.equal(nextMapping.status, 200); validateManifest(nextMapping.body)
  assert.equal(nextMapping.body.versionId, next)
  const stale = await call(`versions/${next}/component-selection`, 'POST', sent.selection)
  assert.equal(stale.status, 200); assert.deepEqual(stale.body, { selectable: false, reason: 'VERSION_MISMATCH' })
  const preserved = await call(`versions/${version}/files/content?path=${selected.sourceFile}`)
  assert.deepEqual(preserved.body, read.body)
  await page.screenshot({ path: join(evidence, 'component-edit-platform.png'), fullPage: true })
  const report = { applicationId: app, baseVersionId: version, versionId: next, taskId: task, sent, edit, mapping: mapping.body, nextMapping: nextMapping.body,
    selection: selected, stale: stale.body, originalSourcePreserved: true, realAuthenticatedApi: true, realPostgres: true, realDocker: true,
    realChromium: true, realPreviewClick: true, modelProvider: 'deterministic-mock', modelQualityAccepted: false }
  await writeFile(join(evidence, 'component-platform.json'), JSON.stringify(report, null, 2) + '\n')
  return report
}
