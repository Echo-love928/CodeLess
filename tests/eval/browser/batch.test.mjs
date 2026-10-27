import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { cases } from '../../../evals/browser/cases.mjs'
import { loadBatch, sha } from '../../../evals/browser/core.mjs'

async function synthetic(t) {
  const dir = await mkdtemp(join(tmpdir(), 'codeless-d21-batch-'))
  t.after(() => rm(dir, { recursive: true, force: true }))
  await mkdir(join(dir, 'frozen')); await mkdir(join(dir, 'samples'))
  const requirements = { requirements: cases.map(c => ({ id: c.id, prompt: c.id + ' original input' })) }
  const frozen = JSON.stringify(requirements)
  const batch = { batchId: 'synthetic-mock-batch', mode: 'MOCK', provider: { id: 'deterministic-mock' }, frozen: { requirements: { sha256: sha(frozen) } }, samples: cases.map(c => ({ id: c.id, kind: 'REQUIREMENT' })) }
  await writeFile(join(dir, 'batch.json'), JSON.stringify(batch)); await writeFile(join(dir, 'frozen/requirements.json'), frozen)
  for (const [index, c] of cases.entries()) {
    const folder = join(dir, 'samples', c.id); await mkdir(folder)
    const record = { sampleId: c.id, batchId: batch.batchId, mode: 'MOCK', attempt: 1,
      task: { id: '00000000-0000-4000-8000-' + String(index).padStart(12, '0'), prompt: requirements.requirements[index].prompt, status: 'FAILED' },
      versions: [], modelCalls: [{ provider: 'deterministic-mock' }], sources: [] }
    await writeFile(join(folder, 'record.json'), JSON.stringify(record)); await writeFile(join(folder, 'invocation-result.json'), JSON.stringify({ exitCode: 0 }))
  }
  return { dir, batch }
}
test('A batch reader retains all nine original task IDs including failed samples', async t => {
  const { dir } = await synthetic(t), loaded = await loadBatch(dir)
  assert.equal(loaded.rows.length, 9)
  assert.ok(loaded.rows.every(r => r.mode === 'MOCK' && r.record.task.status === 'FAILED' && r.version === null))
})
test('A batch reader rejects modified input, forged provider and duplicate task IDs', async t => {
  const { dir } = await synthetic(t)
  const path = join(dir, 'samples/SHOW-02/record.json'), original = await readFile(path, 'utf8'), record = JSON.parse(original)
  record.task.prompt = 'changed'; await writeFile(path, JSON.stringify(record)); await assert.rejects(loadBatch(dir))
  record.task.prompt = 'SHOW-02 original input'; record.modelCalls[0].provider = 'deepseek'; await writeFile(path, JSON.stringify(record)); await assert.rejects(loadBatch(dir))
  record.modelCalls[0].provider = 'deterministic-mock'; record.task.id = '00000000-0000-4000-8000-000000000000'; await writeFile(path, JSON.stringify(record)); await assert.rejects(loadBatch(dir))
})
test('A batch reader detects frozen digest drift and preserves a missing sample', async t => {
  const { dir } = await synthetic(t)
  await rm(join(dir, 'samples/CAT-03/record.json'))
  const loaded = await loadBatch(dir)
  assert.equal(loaded.rows[8].missing, true); assert.equal(loaded.rows.length, 9)
  await writeFile(join(dir, 'frozen/requirements.json'), '{}'); await assert.rejects(loadBatch(dir))
})
