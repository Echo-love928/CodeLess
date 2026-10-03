import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import Ajv2020 from 'ajv/dist/2020.js'

const schema = JSON.parse(await readFile(new URL('../../contracts/plan/plan.schema.json', import.meta.url)))
const valid = JSON.parse(await readFile(new URL('../../contracts/plan/fixtures/valid/static.json', import.meta.url)))
const cases = JSON.parse(await readFile(new URL('../../contracts/plan/fixtures/invalid/cases.json', import.meta.url)))
const validate = new Ajv2020({ strict: true, allErrors: true }).compile(schema)

test('D07-A-T1 valid plan and all supported data modes pass JSON Schema', () => {
  for (const dataMode of ['STATIC', 'MOCK', 'LOCAL_STORAGE']) {
    assert.equal(validate({ ...valid, dataMode }), true, JSON.stringify(validate.errors))
  }
})
for (const fixture of cases) {
  test(`D07-A-T1 reject ${fixture.name}`, () => {
    const candidate = structuredClone(valid)
    const tokens = fixture.pointer.split('/').slice(1)
    const key = tokens.pop()
    const parent = tokens.reduce((node, token) => node[token], candidate)
    parent[key] = fixture.value
    assert.equal(validate(candidate), false, fixture.name)
  })
}
test('schema path grammar matches the existing read-only runner contract', async () => {
  const runner = await readFile(new URL('../../services/runner/src/template/build.mjs', import.meta.url), 'utf8')
  const source = runner.match(/const allowed = (\/.*\/)\r?\n/)[1]
  const allowed = new RegExp(source.slice(1, -1))
  const planned = new RegExp(schema.properties.files.items.properties.path.pattern)
  const paths = [valid.files[0].path, 'src/components/Card.vue', 'src/data/tasks.ts', ...cases
    .filter((item) => item.pointer === '/files/0/path').map((item) => item.value)]
  for (const path of paths) {
    // The API is at least as strict as the runner. It additionally rejects a trailing newline.
    if (planned.test(path) && !path.includes('\n')) assert.equal(allowed.test(path), true, path)
  }
})
