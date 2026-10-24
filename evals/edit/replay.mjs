import { join } from 'node:path'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { bindCatalog } from '../../services/runner/src/mapping/manifest.mjs'
import { edits, editTarget, scopeDiff } from './cases.mjs'
import { validateEditRecord, editBlocker, writeCandidate } from './records.mjs'
import { inspect } from '../browser/browser.mjs'
import { cases, behavior } from '../browser/cases.mjs'

export async function replayEdits({ loaded, rows, mappings, records, build, browser, output, save = async () => {}, inspectPage = inspect }) {
  const result = []
  const versions = new Map()
  for (const base of loaded.rows) if (base.version && mappings.has(base.sampleId)) versions.set(base.version.id, {
    sampleId: base.sampleId, base, mapping: mappings.get(base.sampleId), build: rows.find(row => row.sampleId === base.sampleId)?.build })
  for (const edit of edits) {
    const base = rows.find(row => row.sampleId === edit.base), mapping = mappings.get(edit.base), input = records.get(edit.id)
    const row = { sampleId: edit.id, mode: loaded.batch.mode, baseSampleId: edit.base, prompt: edit.prompt,
      componentId: edit.componentId, targetFile: edit.file, taskId: null, beforeVersionId: null, afterVersionId: null,
      passed: null, status: 'NOT_EXECUTED', modelRequests: 0 }
    if (!input) Object.assign(row, editBlocker(edit, base, mapping))
    else try {
      // The platform requires the current version. Sequential edits may therefore
      // use a previously proven edit version, while retaining the frozen root sample.
      const context = versions.get(input.record.edit.baseVersionId)
      assert.ok(context && context.sampleId === edit.base, 'Edit base has no proven ancestry to this frozen requirement')
      const accepted = validateEditRecord(input.record, edit, context.base, loaded.batch, context.mapping)
      Object.assign(row, { taskId: accepted.task.id, beforeVersionId: input.record.before.version.id,
        afterVersionId: input.record.after?.version.id ?? null, beforeDigest: input.record.before.version.sourceDigest,
        afterDigest: input.record.after?.version.sourceDigest ?? null, rawDigest: input.digest, usage: accepted.usage,
        mapping: accepted.mapping, platformFailureCode: accepted.task.failureCode ?? null, status: 'FAILED', passed: false })
      if (accepted.task.status !== 'READY') row.failure = 'EDIT_TASK_FAILED'
      else {
        const source = join(output, edit.id, 'source')
        await writeCandidate(source, input.record)
        row.scope = scopeDiff(accepted.before, accepted.after, edit.file)
        row.build = await build(source)
        const route = cases.find(c => c.id === edit.base).route
        row.baselineBrowser = context.build?.status === 'SUCCEEDED' ? await inspectPage(browser, context.build.artifact,
          { route, output: join(output, edit.id, 'before'), action: (page, expect) => editTarget(page, edit, expect, 'before') }) : null
        row.browser = row.build.status === 'SUCCEEDED' ? await inspectPage(browser, row.build.artifact,
          { route, output: join(output, edit.id, 'after'), action: async (page, expect) => {
            await editTarget(page, edit, expect)
            if (edit.base === 'TASK-01') await behavior(page, edit.base, expect)
            if (edit.file.endsWith('WorkCard.vue')) for (const title of ['Harvard Mark I 编程', 'A-0 编译器', 'COBOL 标准化'])
              await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible()
          } }) : null
        row.failure = !row.scope.passed ? 'EDIT_SCOPE' : row.build.status !== 'SUCCEEDED' || row.build.exitCode !== 0 ? 'EDIT_BUILD_FAILED'
          : row.baselineBrowser?.status !== 'PASSED' ? 'EDIT_BASELINE_BEHAVIOR' : row.browser?.status !== 'PASSED' ? row.browser?.failure ?? 'EDIT_BROWSER_UNKNOWN' : null
        row.passed = row.failure === null; row.status = row.passed ? 'PASSED' : 'FAILED'
        if (row.build.status === 'SUCCEEDED') {
          const afterMapping = bindCatalog({ catalog: JSON.parse(await readFile(join(row.build.artifact.directory, 'ai-component-catalog.json'), 'utf8')),
            sourceManifest: { files: accepted.after, digest: row.afterDigest }, versionId: row.afterVersionId, sourceDigest: row.afterDigest })
          if (!afterMapping.components.some(c => c.componentId === edit.componentId && c.sourceFile === edit.file)) {
            row.failure ??= 'EDIT_COMPONENT_MAPPING'; row.passed = false; row.status = 'FAILED'
          }
          versions.set(row.afterVersionId, { sampleId: edit.base, base: { record: { task: accepted.task }, version: input.record.after.version }, mapping: afterMapping, build: row.build })
        }
      }
    } catch (error) {
      Object.assign(row, { mode: 'UNKNOWN', status: 'INVALID_EVIDENCE', passed: false, failure: 'EDIT_EVIDENCE_OR_HARNESS', error: error.message.slice(0, 1500) })
    }
    result.push(row); await save(result)
  }
  return result
}
