# D07-A-T4 actual provider evidence

One real `deepseek-flash` request completed on 2026-10-02 at code candidate
`c31cadb0e682881f7c32708f644abfa00a529d79`. The API jar's `PlanAcceptanceCli`
used the production adapter, packaged runtime prompt and Java plan validator.
The command exited **0**; no mock, fallback or application retry was used.

```powershell
. ./.local-data/d07-a/env.ps1 # Local Java 21 helper; use your own Java 21 elsewhere.
# User-scoped credentials were loaded into this process without printing them.
tests/model/run-real-plan.ps1 -Evidence .local-data/d07-a/evidence/real-model-live-20261002-200059
```

The fixed acceptance input was `创建个人展示页，展示姓名、介绍和三个作品，全部使用静态数据。`
with trusted data mode `STATIC`, maximum 2048 output tokens and 60-second timeout.
`t4-result.json` is the adapter's measured audit record; the UUID `.plan.json`
is the original validated model plan. These are acceptance artifacts, not CI mock
fixtures. They contain no credential or account data. The ignored local directory
retains `command.log` and `command.exit`; the earlier configuration failure
evidence remains separately preserved.

- Actual model: `deepseek-flash`; status: `SUCCEEDED`; duration: **2584 ms**.
- Provider request/response ID: `4b5b92fb-7657-4bd6-af8e-3e12683ad6f7`.
- Provider-reported input/output/total tokens: **1208 / 373 / 1581**; raw usage retained.
- Plan SHA-256: `cf0649c81a5f7c38b3dc242ff56e3cd0965ed89f811d7ebba31ff2c2d8913963`.
- Development-agent input/output/total tokens remain **unknown**; separate ledger.

Offline reproduction below validates the saved real plan against the frozen
Schema, verifies its bytes and reads the recorded usage. It makes **no model
request**. Run from repository root after the frozen dependencies are installed:

```powershell
@'
import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import assert from 'node:assert/strict'
import Ajv2020 from 'ajv/dist/2020.js'
const root = 'tests/model/evidence/2026-10-02/'
const record = JSON.parse(await readFile(root + 't4-result.json', 'utf8'))
const bytes = await readFile(root + record.callId + '.plan.json')
const schema = JSON.parse(await readFile('contracts/plan/plan.schema.json', 'utf8'))
const validate = new Ajv2020({ strict: true, allErrors: true }).compile(schema)
assert.equal(record.provider, 'deepseek')
assert.equal(record.status, 'SUCCEEDED')
assert.equal(validate(JSON.parse(bytes)), true, JSON.stringify(validate.errors))
const sha256 = createHash('sha256').update(bytes).digest('hex')
assert.equal(sha256, 'cf0649c81a5f7c38b3dc242ff56e3cd0965ed89f811d7ebba31ff2c2d8913963')
console.log(JSON.stringify({ status: record.status, planValid: true, sha256, requestId: record.requestId, usage: record.usage }))
'@ | node --input-type=module
```

This proves one real structured PLAN request. It does not prove generated source,
build/browser success, the full generation state machine or long-term model quality.
The final enabling PR owns that integration. Re-running the real CLI is optional
and incurs another request; CI remains explicitly deterministic.
