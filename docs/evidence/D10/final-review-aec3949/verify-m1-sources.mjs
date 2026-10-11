import fs from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { randomUUID } from 'node:crypto'
import assert from 'node:assert/strict'

// Run from the repository root. No provider call; use the two committed real M1 snapshots and original actions.
const output = path.resolve('.local-data/b-m1-source-recheck-' + randomUUID())
const source = path.resolve('tests/agent/repair/evidence/2026-10-11/closure')
const { createBuildVerifier } = await import(pathToFileURL(path.resolve('services/runner/src/verify/workflow.mjs')))
const actions = JSON.parse(await fs.readFile(path.join(source, 'original-actions.json'), 'utf8')).original
const run = await createBuildVerifier({ workRoot: path.join(output, 'work'), artifactRoot: path.join(output, 'artifacts'), evidenceRoot: path.join(output, 'browser') })
const results = []
for (const phase of ['failed', 'ready']) results.push({ phase, ...await run(path.join(source, 'source', phase), actions) })
await fs.writeFile(path.join(output, 'results.json'), JSON.stringify({ sourceTask: '201b3882-30a8-4ac9-b0ac-cf3c024eabdf', newModelCalls: 0, originalActions: actions, results }, null, 2))
assert.equal(results[0].build.exitCode, 2)
assert.match(results[0].build.log.text, /TS2307.*M1MissingCard.vue/)
assert.equal(results[1].build.exitCode, 0)
assert.equal(results[1].verification.status, 'PASSED')
assert.equal(results[1].verification.diagnostics.actions.length, 6)
assert.ok(results[1].verification.diagnostics.actions.every(action => action.status === 'PASSED'))
console.log('Original M1 source build2 -> build0/browser6 PASSED; zero model calls; evidence: ' + output)
