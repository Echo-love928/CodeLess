import { mkdir, readFile, writeFile, readdir } from 'node:fs/promises'
import { resolve, join, dirname } from 'node:path'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'

// Separate dated revision: never overwrite the original failed/successful evidence.
const repository = resolve(fileURLToPath(new URL('../../', import.meta.url)))
const input = resolve(process.argv[2] ?? join(repository, '.local-data/d09-a/revision-2026-10-04'))
const output = join(repository, 'tests/agent/evidence/2026-10-04')
const hash = bytes => 'sha256:' + createHash('sha256').update(bytes).digest('hex')
const read = async path => JSON.parse(await readFile(path, 'utf8'))
function portable(value) {
  if (Array.isArray(value)) return value.map(portable)
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, portable(v)]))
  if (typeof value === 'string' && /^[A-Za-z]:[\\/]|^\//.test(value) && value.toLowerCase().startsWith(repository.toLowerCase()))
    return '/workspace' + value.slice(repository.length).replaceAll('\\', '/')
  return value
}
await mkdir(output, { recursive: true })
const save = async (name, value) => writeFile(join(output, name), JSON.stringify(portable(value), null, 2) + '\n')
async function assets(label, draft, runner) {
  for (const file of draft?.files ?? []) {
    if (!/^src\/(?:pages|components)\/[A-Za-z][A-Za-z0-9_-]*\.vue$|^src\/data\/[A-Za-z][A-Za-z0-9_-]*\.ts$/.test(file.path))
      throw new Error('source export path rejected')
    const bytes = await readFile(join(draft.sourceDirectory, file.path))
    if (hash(bytes) !== file.digest || bytes.length !== file.bytes) throw new Error('source export hash mismatch')
    const target = join(output, 'source', label, file.path)
    await mkdir(dirname(target), { recursive: true }); await writeFile(target, bytes)
  }
  const png = runner?.verification?.screenshot
  if (png) {
    const bytes = await readFile(png.path)
    if (hash(bytes) !== png.digest || bytes.length !== png.bytes) throw new Error('PNG export hash mismatch')
    await mkdir(join(output, 'screenshots'), { recursive: true })
    await writeFile(join(output, 'screenshots', label + '.png'), bytes)
  }
}
const commands = [
  ['services/api/mvnw.cmd -f services/api/pom.xml -Dtest=LocalBuildGatewayTest test', 'gateway-before', 1, 'original implementation: 3/4 pass; interruption blocked with two real live processes'],
  ['services/api/mvnw.cmd -f services/api/pom.xml -Dtest=LocalBuildGatewayTest test', 'gateway-after', 0, 'fix: 4/4 pass; interrupt preserved, both processes terminate'],
  ['services/api/mvnw.cmd -f services/api/pom.xml -Dtest=RealAgentAcceptanceIT test', 'real-paid', 1, 'real two-file TypeScript prop mismatch; build exit 2'],
  ['services/api/mvnw.cmd -f services/api/pom.xml -Dtest=RealAgentAcceptanceIT test', 'real-readback', 1, 'readback prompt: PLAN MODEL_NETWORK; usage unknown; no further paid attempt'],
  ['pnpm --filter @codeless/web exec vitest run src/features/preview/preview-api.test.ts', 'peer-port', 0, 'B worktree: 4/4'],
  ['services/api/mvnw.cmd -f services/api/pom.xml -Dtest=TaskQueueIntegrationTest,PreviewHttpTest test', 'peer-api', 1, 'B worktree: 8 errors: Docker was not running; original log retained'],
  ['services/api/mvnw.cmd -f services/api/pom.xml -Dtest=TaskQueueIntegrationTest,PreviewHttpTest test', 'peer-api-recovered', 0, 'B worktree: 8/8 after restoring Docker; assertions unchanged'],
  ['node --test tests/e2e/preview/browser.acceptance.mjs', 'peer-browser', 0, 'B worktree: 1/1 real Docker/TLS/Chromium, explicit platform API fixtures'],
  ['pnpm ci:gate', 'ci-gate', 1, 'API99: existing D08 temp-directory cleanup error; Agent/lifecycle tests passed, other gates passed'],
  ['services/api/mvnw.cmd -f services/api/pom.xml -Dtest=LocalBuildGatewayTest,FileToolsIntegrationTest test', 'cleanup-diagnostic', 0, '14/14; prior transient directory error not reproduced, root cause unconfirmed'],
  ['pnpm ci:gate', 'ci-gate-final', 0, 'static/API99/runner30/e2e28; no skipped checks'],
]
for (const row of commands) {
  const actual = Number((await readFile(join(input, row[1] + '.exit'), 'utf8')).trim())
  if (actual !== row[2]) throw new Error('unexpected command exit: ' + row[1])
}
await save('commands.json', { parentCandidate: '5f29b335157fdbb3565b4e63be987cdd3c24a3c3', commands: await Promise.all(commands.map(async ([command, name, exitCode, result]) => ({
  command, exitCode, result, log: '.local-data/d09-a/revision-2026-10-04/' + name + '.log', logDigest: hash(await readFile(join(input, name + '.log')))
}))), realModelCompleteSuccess: false, developmentTokens: { input: null, output: null, total: null, source: 'unknown' } })
for (const stage of ['before', 'after', 'gate-lifecycle']) for (const name of ['interruption', 'timeout'])
  await save('gateway-' + stage + '-' + name + '.json', await read(join(input, stage, name + '.json')))
for (const file of (await readdir(join(input, 'gate-evidence'))).filter(name => name.endsWith('.json')))
  await save(file, await read(join(input, 'gate-evidence', file)))
const mock = await read(join(input, 'gate-evidence/D09-A-T1.json'))
await assets('mock', mock.draft, mock.runner)
const usages = []
for (const name of ['real-paid', 'real-readback']) {
  const value = await read(join(input, name, 'real-result.json'))
  await save(name + '.json', value)
  await assets(name, value.events.findLast(event => event.kind === 'draft')?.payload, value.events.findLast(event => event.kind === 'runner.result')?.payload)
  usages.push(...value.events.filter(event => event.kind === 'model.usage').map(event => event.payload.usage))
}
const previous = (await read(join(repository, 'tests/agent/evidence/2026-10-03/runtime-usage.json'))).realModel
const known = usages.filter(usage => Number.isInteger(usage.inputTokens) && Number.isInteger(usage.outputTokens) && Number.isInteger(usage.totalTokens))
const sum = key => known.reduce((total, usage) => total + usage[key], 0)
await save('runtime-usage.json', { source: 'provider responses and private model.usage audit; unknown calls remain unknown',
  thisRevision: { attemptedCalls: usages.length, knownUsageCalls: known.length, unknownUsageCalls: usages.length - known.length,
    knownInputSubtotal: sum('inputTokens'), knownOutputSubtotal: sum('outputTokens'), knownReportedTotalSubtotal: sum('totalTokens') },
  cumulative: { attemptedCalls: previous.attemptedCalls + usages.length, knownUsageCalls: previous.knownUsageCalls + known.length,
    unknownUsageCalls: previous.unknownUsageCalls + usages.length - known.length, knownInputSubtotal: previous.knownInputSubtotal + sum('inputTokens'),
    knownOutputSubtotal: previous.knownOutputSubtotal + sum('outputTokens'), knownReportedTotalSubtotal: previous.knownReportedTotalSubtotal + sum('totalTokens'), completeTotal: null, completeTotalStatus: 'UNKNOWN' } })
await save('B-review.json', { reviewedHead: '9e268846cb1f219c60c4ecac058b536c3470db58', trackedPeerFilesModified: false,
  fixedQueueGuardMatchesA: true, trustedOriginPortTests: 4, databaseTests: 8, realBrowserTests: 1,
  browser: await read(join(input, 'peer-browser-evidence/acceptance.json')), checks: await read(join(input, 'pr20-checks.json')),
  submittedReview: await read(join(input, 'B-review-submitted.json')), integrationPR21Approval: false,
  integrationPR21: '4e8bd413fc1a121a48db7d46fdedc263c1f56f2a; read handoff/CI only, still contains original interrupted gateway',
  remaining: ['A real-model acceptance has no success', 'integration PR21 must synchronize the interrupted gateway fix; author must rerun affected checks and seek independent review'] })
console.log('Exported dated byte-verified revision evidence; original 2026-10-03 evidence unchanged.')
