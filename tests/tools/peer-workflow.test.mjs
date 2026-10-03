import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import test from 'node:test'

// Cross-PR acceptance: load the exact read-only D08-B candidate, with no copied or modified peer code.
test('D08-A file tools -> D08-B real workflow: root, fixed Vue routes and reload verify with matching hashes', { timeout: 180000 }, async () => {
  assert.ok(process.env.CODELESS_D08_B_REVIEW_ROOT, 'Set the read-only D08-B worktree root')
  assert.ok(process.env.CODELESS_FILE_EVIDENCE_DIR, 'Run the Java producer with evidence first')
  const evidence = resolve(process.env.CODELESS_FILE_EVIDENCE_DIR)
  const peer = resolve(process.env.CODELESS_D08_B_REVIEW_ROOT)
  const { createBuildVerifier } = await import(pathToFileURL(join(peer, 'services/runner/src/verify/workflow.mjs')))
  const expected = JSON.parse(await readFile(join(evidence, 'fixed-source.json'), 'utf8'))
  const run = await createBuildVerifier({ workRoot: join(evidence, 'peer-integration-work'),
    artifactRoot: join(evidence, 'peer-integration-artifacts'), evidenceRoot: join(evidence, 'peer-integration-browser') })
  const root = await run(join(evidence, 'fixed-source'), [{ type: 'expectText',
    target: { role: 'heading', name: '林予安，设计与摄影' }, value: '林予安，设计与摄影' }])
  await writeFile(join(evidence, 'peer-integration-root.json'), JSON.stringify(root, null, 2))
  assert.equal(root.status, 'VERIFIED', JSON.stringify(root))
  assert.equal(root.sourceDigest, expected.source.sourceDigest)
  assert.equal(root.verification.sourceDigest, expected.source.sourceDigest)
  assert.equal(root.verification.artifactDigest, root.build.artifact.digest)
  const tasks = await run(join(evidence, 'fixed-source'), [{ type: 'navigate', path: '/tasks' },
    { type: 'expectText', target: { role: 'heading', name: '今日任务' }, value: '今日任务' },
    { type: 'fill', target: { role: 'textbox', name: '新任务' }, value: 'A真实文件工具联调刷新保留' },
    { type: 'click', target: { role: 'button', name: '添加' } },
    { type: 'reload' },
    { type: 'expectText', target: { text: 'A真实文件工具联调刷新保留' }, value: 'A真实文件工具联调刷新保留' },
    { type: 'navigate', path: '/catalog' },
    { type: 'expectText', target: { role: 'heading', name: '寻找下一次灵感' }, value: '寻找下一次灵感' },
    { type: 'click', target: { role: 'button', name: '阅读' } },
    { type: 'expectVisible', target: { role: 'heading', name: '山间书屋' } },
    { type: 'reload' },
    { type: 'expectVisible', target: { role: 'heading', name: '城市地图' } },
    { type: 'navigate', path: '/tasks' },
    { type: 'expectText', target: { text: 'A真实文件工具联调刷新保留' }, value: 'A真实文件工具联调刷新保留' }])
  await writeFile(join(evidence, 'peer-integration-tasks.json'), JSON.stringify(tasks, null, 2))
  assert.equal(tasks.status, 'VERIFIED', JSON.stringify(tasks))
  assert.equal(tasks.verification.sourceDigest, expected.source.sourceDigest)
  for (const result of [root, tasks]) {
    const report = result.verification
    assert.equal(report.artifactDigest, result.build.artifact.digest)
    assert.equal(report.diagnostics.controlHost, '127.0.0.1')
    assert.equal(report.cleanup.browserClosed, true)
    assert.deepEqual(report.diagnostics.pageErrors, [])
    assert.deepEqual(report.diagnostics.consoleErrors, [])
    assert.deepEqual(report.diagnostics.blockedRequests, [])
    assert.deepEqual(report.diagnostics.failedRequests, [])
    const png = await readFile(report.screenshot.path)
    assert.equal(png.length, report.screenshot.bytes)
    assert.equal('sha256:' + createHash('sha256').update(png).digest('hex'), report.screenshot.digest)
  }
})
