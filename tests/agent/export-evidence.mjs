import { mkdir, readFile, writeFile, copyFile, readdir } from 'node:fs/promises'
import { resolve, join, dirname } from 'node:path'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'

const repo = fileURLToPath(new URL('../../', import.meta.url))
const input = resolve(process.argv[2] ?? join(repo, '.local-data/d09-a'))
const output = resolve(repo, 'tests/agent/evidence/2026-10-03')
await mkdir(output, { recursive: true })
const hash = (bytes) => 'sha256:' + createHash('sha256').update(bytes).digest('hex')
function portable(value) {
  if (Array.isArray(value)) return value.map(portable)
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, portable(item)]))
  if (typeof value === 'string' && /^[A-Za-z]:[\\/]|^\//.test(value) && value.toLowerCase().startsWith(resolve(repo).toLowerCase())) {
    return '/workspace' + value.slice(resolve(repo).length).replaceAll('\\', '/')
  }
  return value
}
async function report(name, value) { await writeFile(join(output, name), JSON.stringify(portable(value), null, 2) + '\n') }
async function sourceAndScreenshot(label, draft, result) {
  if (draft?.files) for (const file of draft.files) {
    const bytes = await readFile(join(draft.sourceDirectory, file.path))
    if (hash(bytes) !== file.digest || bytes.length !== file.bytes) throw new Error('export source mismatch')
    const target = join(output, 'source', label, file.path)
    await mkdir(dirname(target), { recursive: true }); await writeFile(target, bytes)
  }
  const png = result?.verification?.screenshot
  if (png) {
    const bytes = await readFile(png.path)
    if (hash(bytes) !== png.digest || bytes.length !== png.bytes) throw new Error('export screenshot mismatch')
    await mkdir(join(output, 'screenshots'), { recursive: true })
    await copyFile(png.path, join(output, 'screenshots', label + '.png'))
  }
}
for (const name of (await readdir(join(input, 'evidence'))).filter((name) => name.endsWith('.json')).sort()) {
  const value = JSON.parse(await readFile(join(input, 'evidence', name), 'utf8'))
  await report(name, value)
  if (name === 'D09-A-T1.json') await sourceAndScreenshot('mock', value.draft, value.runner)
}
for (const [directory, label] of [['real', 'real-first-failed'], ['real-typed', 'real-typed']]) {
  let value
  try { value = JSON.parse(await readFile(join(input, directory, 'real-result.json'), 'utf8')) }
  catch (error) { if (error.code === 'ENOENT') continue; throw error }
  await report(label + '.json', value)
  const draft = value.events.findLast((event) => event.kind === 'draft')?.payload
  const runner = value.events.findLast((event) => event.kind === 'runner.result')?.payload
  await sourceAndScreenshot(label, draft, runner)
}
// Preserve the initially environment-selected real call evidence, separately from mock success.
const modelRoot = resolve(repo, 'services/api/target/agent-integration/models')
const initial = []
for (const file of (await readdir(modelRoot)).filter((name) => /^[a-f0-9-]+\.json$/.test(name))) {
  const value = JSON.parse(await readFile(join(modelRoot, file), 'utf8'))
  if (value.taskId === 'ef0691c9-66e6-4e08-a8b0-4168f7db1640') initial.push(value)
}
if (initial.length) await report('initial-real-budget-failure.json', { fixture: false, status: 'FAILED',
  failureCode: 'AGENT_MODEL_BUDGET_EXCEEDED', reason: 'environment-selected provider; conservative reservations subsequently corrected', modelCalls: initial })
const realCalls = initial.map((call) => call.usage)
for (const directory of ['real', 'real-typed']) {
  let value
  try { value = JSON.parse(await readFile(join(input, directory, 'real-result.json'), 'utf8')) }
  catch (error) { if (error.code === 'ENOENT') continue; throw error }
  realCalls.push(...value.events.filter((event) => event.kind === 'model.usage').map((event) => event.payload.usage))
}
await report('runtime-usage.json', { developmentAgent: { inputTokens: null, outputTokens: null, totalTokens: null, source: 'UNKNOWN_NO_TASK_METER' },
  realModel: { attemptedCalls: realCalls.length, knownUsageCalls: realCalls.filter((usage) => usage.totalTokens !== null).length,
    unknownUsageCalls: realCalls.filter((usage) => usage.totalTokens === null).length,
    knownInputSubtotal: realCalls.reduce((sum, usage) => sum + (usage.inputTokens ?? 0), 0),
    knownOutputSubtotal: realCalls.reduce((sum, usage) => sum + (usage.outputTokens ?? 0), 0),
    knownReportedTotalSubtotal: realCalls.reduce((sum, usage) => sum + (usage.totalTokens ?? 0), 0),
    completeTotal: realCalls.some((usage) => usage.totalTokens === null) ? null : realCalls.reduce((sum, usage) => sum + usage.totalTokens, 0),
    completeTotalStatus: realCalls.some((usage) => usage.totalTokens === null) ? 'UNKNOWN' : 'MEASURED' },
  deterministicT1: { provider: 'deterministic-mock', requests: 4, inputTokens: null, outputTokens: null, totalTokens: null } })
console.log('Exported byte-verified source, screenshots and portable agent reports to tests/agent/evidence/2026-10-03')
