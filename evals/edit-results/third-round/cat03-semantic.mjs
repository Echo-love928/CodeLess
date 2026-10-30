// Supplemental semantic review of the original built CAT-03. Does not change its frozen report or source.
import assert from 'node:assert/strict'
import { readFile, mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { chromium } from '@playwright/test'
import { inspect } from '../../browser/browser.mjs'
import { sha } from '../../browser/core.mjs'
const [reportPath, batch, output] = process.argv.slice(2)
const report = JSON.parse(await readFile(reportPath, 'utf8'))
const row = report.rows.find(r => r.sampleId === 'CAT-03')
assert.equal(row.mode, 'REAL'); assert.equal(row.build.status, 'SUCCEEDED')
const raw = await readFile(join(batch, 'samples/CAT-03/record.json'))
assert.equal(sha(raw), row.rawDigest)
const record = JSON.parse(raw), version = record.versions.find(v => v.id === row.versionId)
assert.equal(version.sourceDigest, row.sourceDigest)
const bytes = await readFile(join(batch, `samples/CAT-03/source/v${version.number}/src/data/tools.ts`))
// Read this inspected immutable literal table without executing generated TypeScript on the host.
const pattern = /\{\s*id: '([^']+)',\s*name: '([^']+)',\s*category: '([^']+)',\s*license: '([^']+)',\s*summary: '([^']+)',\s*details: '([^']+)'\s*\}/gu
const tools = [...bytes.toString('utf8').matchAll(pattern)].map(m => Object.fromEntries(
  ['id', 'name', 'category', 'license', 'summary', 'details'].map((key, i) => [key, m[i + 1]])))
assert.equal(tools.length, 9); assert.equal(new Set(tools.map(t => t.id)).size, 9)
const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => /^(PATH|SYSTEMROOT|WINDIR|USERPROFILE|HOME|TEMP|TMP|LOCALAPPDATA|PLAYWRIGHT_BROWSERS_PATH)$/i.test(k)))
await mkdir(output, { recursive: true })
const browser = await chromium.launch({ headless: true, env })
const list = async (page, expect) => {
  await expect(page.locator('li.tool-card')).toHaveCount(9)
  for (const tool of tools) {
    const title = page.getByRole('button', { name: tool.name, exact: true })
    await expect(title).toHaveCount(1); await expect(title).toBeVisible()
    const card = page.locator('li.tool-card').filter({ has: title })
    await expect(card.locator('p.meta')).toContainText(`类别：${tool.category}`)
    await expect(card.locator('p.meta')).toContainText(`许可证：${tool.license}`)
    await expect(card.locator('p.summary')).toHaveText(tool.summary)
    assert.ok([tool.category, tool.license, tool.summary].every(Boolean))
  }
}
const result = { task: 'D25-B', mode: 'SUPPLEMENTAL_SEMANTIC_SOURCE_REPLAY',
  changesOriginalReport: false, sourceDigest: row.sourceDigest, versionId: row.versionId,
  originalReportDigest: sha(await readFile(reportPath)), dataDigest: sha(bytes),
  additionalModelRequests: 0, probes: {} }
try {
  result.probes.actual = await inspect(browser, row.build.artifact, { route: '/catalog', output: join(output, 'actual'),
    action: async (page, expect) => {
      await list(page, expect)
      for (const tool of tools) {
        await page.getByRole('button', { name: tool.name, exact: true }).click()
        await expect(page.getByTestId('tool-details-' + tool.id)).toHaveText(tool.details)
        await expect(page.locator('li.tool-card')).toHaveCount(9)
        await page.getByRole('button', { name: tool.name, exact: true }).click()
        await expect(page.getByTestId('tool-details-' + tool.id)).toHaveCount(0)
      }
      const search = page.getByRole('textbox'), category = page.getByRole('combobox')
      for (const group of ['构建', '测试', '文档']) {
        await category.selectOption(group)
        await expect(page.locator('li.tool-card')).toHaveCount(3)
        for (const card of await page.locator('li.tool-card').all()) await expect(card.locator('p.meta')).toContainText(`类别：${group}`)
      }
      await category.selectOption('测试'); await search.fill('Vite')
      await expect(page.locator('li.tool-card')).toHaveCount(1)
      await expect(page.getByRole('button', { name: 'Vitest', exact: true })).toBeVisible()
      await search.fill('VitePress'); await expect(page.locator('li.tool-card')).toHaveCount(0)
      await expect(page.getByText('没有匹配的工具', { exact: true })).toBeVisible()
      await search.fill(''); await expect(category).toHaveValue('测试')
      await expect(page.locator('li.tool-card')).toHaveCount(3)
      await category.selectOption('全部'); await search.fill('VitePress')
      await expect(page.locator('li.tool-card')).toHaveCount(1)
      await page.getByRole('button', { name: 'VitePress', exact: true }).click()
      await expect(page.getByTestId('tool-details-vitepress')).toBeVisible()
      await search.fill('D25绝不存在的关键词'); await expect(page.locator('li.tool-card')).toHaveCount(0)
      await expect(page.getByText('没有匹配的工具', { exact: true })).toBeVisible()
      await search.fill(''); await list(page, expect)
      await category.selectOption('测试'); await page.reload(); await list(page, expect)
      await expect(page.getByRole('combobox')).toHaveValue('全部') // This original app is STATIC, not LocalStorage.
    } })
  for (const field of ['license', 'summary']) result.probes['negative-' + field] = await inspect(browser, row.build.artifact, {
    route: '/catalog', output: join(output, 'negative-' + field), action: async (page, expect) => {
      // Disposable DOM negative control only; never changes an immutable source/version.
      await page.locator(field === 'license' ? 'p.meta' : 'p.summary').first().evaluate(node => { node.textContent = 'INVALID_FIELD' })
      let rejected = false
      try { await list(page, expect) } catch { rejected = true }
      assert.equal(rejected, true, 'Semantic assertions must detect omitted/wrong fields')
    } })
  result.status = Object.values(result.probes).every(p => p.status === 'PASSED') ? 'PASSED' : 'FAILED'
} finally { await browser.close(); await writeFile(join(output, 'semantic.json'), JSON.stringify(result, null, 2) + '\n') }
console.log(JSON.stringify({ output, status: result.status, additionalModelRequests: 0, changesOriginalReport: false }))
process.exitCode = result.status === 'PASSED' ? 0 : 1
