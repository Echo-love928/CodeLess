import assert from 'node:assert/strict'
import { readFile, writeFile, copyFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { resolve, join } from 'node:path'

const root = process.cwd(), privateRoot = join(root, '.local-data/d10-b')
const output = join(root, 'docs/evidence/D10')
const json = async file => JSON.parse(await readFile(file, 'utf8'))
const hash = bytes => 'sha256:' + createHash('sha256').update(bytes).digest('hex')
const manifest = await json(join(privateRoot, 'generation/manifest.json'))
const portable = { ...manifest, artifactDirectory: undefined,
  verification: { ...manifest.verification, screenshot: { ...manifest.verification.screenshot, path: 'generated-page.png' } } }
const screenshot = await readFile(manifest.verification.screenshot.path)
assert.equal(hash(screenshot), manifest.verification.screenshot.digest)
await copyFile(manifest.verification.screenshot.path, join(output, 'deterministic/generated-page.png'))
await writeFile(join(output, 'deterministic/runner-results.json'), JSON.stringify(portable, null, 2) + '\n')
const commands = []
for (const [name, command] of [
  ['static', 'pnpm verify:static'],
  ['generation', 'pnpm --filter @codeless/web exec playwright test --config playwright.config.ts generation'],
  ['generation-focused', 'node node_modules/@playwright/test/cli.js test --config playwright.config.ts generation --workers=1'],
  ['generation-corrected', 'node node_modules/@playwright/test/cli.js test --config playwright.config.ts --grep D10-B --workers=1'],
  ['generation-bootstrap-fixed', 'node node_modules/@playwright/test/cli.js test --config playwright.config.ts --grep D10-B --workers=1'],
  ['ci-gate', 'pnpm ci:gate'],
  ['peer-followup-static', 'pnpm verify:static (peer-review failure-code followup)'],
]) {
  const raw = await readFile(join(privateRoot, name + '.log'))
  const exitCode = Number((await readFile(join(privateRoot, name + '.exit'), 'utf8')).trim())
  assert.ok(Number.isInteger(exitCode))
  commands.push({ name, command, exitCode, privateLog: `.local-data/d10-b/${name}.log`, bytes: raw.length, digest: hash(raw) })
}
const shots = []
for (const name of ['success', 'failure', 'cancelled', 'recovered']) {
  const raw = await readFile(join(output, 'deterministic', name + '.png'))
  shots.push({ name, path: `deterministic/${name}.png`, bytes: raw.length, digest: hash(raw), provider: 'd10-source-fixture', modelQualityAccepted: false })
}
const gateLog = await readFile(join(privateRoot, 'ci-gate.log'), 'utf8')
const gate = commands.find(command => command.name === 'ci-gate')
const stages = Object.fromEntries(['static', 'api', 'runner', 'e2e'].map(name => [name, {
  command: `pnpm verify:${name}`, exitCode: gate.exitCode === 0 && gateLog.includes('[ci-gate] all stages passed') ? 0 : null,
  measurement: 'CI_GATE_CHILD_EXIT_STATUS_AGGREGATION',
}]))
await writeFile(join(output, 'commands-and-results.json'), JSON.stringify({ date: '2026-10-07', timezone: 'Asia/Shanghai',
  baseline: 'adb79b86f221862a970733a406d09fd96e92250e', commands, stages, screenshots: shots,
  fixtureModelQualityAccepted: false, realModel: { status: 'BLOCKED_BY_APPROVAL_REVIEW', requests: 0, inputTokens: 0, outputTokens: 0 },
  d10AIntegration: 'BLOCKED_REAL_REPAIR_AND_SAME_TASK_INTEGRATION',
  d10AReview: { candidate: '85c39f3fd331265ccd15cd493b9cf0dbbadd5fad',
    url: 'https://github.com/Echo-love928/CodeLess/pull/24#pullrequestreview-5439239058',
    disposition: 'COMMENTED_NOT_APPROVED', deterministicTests: 13, deterministicExitCode: 0,
    blockers: ['REAL_REPAIR_MODEL_NETWORK', 'WINDOWS_CLEANUP_UNKNOWN', 'REMOTE_RUNNER_AND_CI_GATE_FAILED', 'SAME_TASK_UI_REPAIR_PREVIEW_NOT_ACCEPTED'] }, developerTokens: { input: null, output: null, total: null, measurement: 'UNKNOWN' } }, null, 2) + '\n')
