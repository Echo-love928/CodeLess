import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFile, mkdtemp, mkdir, rm } from 'node:fs/promises'
import { join, dirname, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { validateActions } from '../../../services/runner/src/verify/actions.mjs'
import { openArtifactService } from '../../../services/runner/src/artifacts/service.mjs'
import { createBrowserVerifier } from '../../../services/runner/src/verify/verifier.mjs'
import { completedFixture } from './fixtures.mjs'

test('shared Java/Node vectors preserve fill input bytes while keeping assertions and limits strict', async () => {
  const vectors = JSON.parse(await readFile(new URL('./input-values.json', import.meta.url)))
  for (const vector of vectors) {
    const action = { type: vector.type, target: { testId: 'input' } }
    if (Object.hasOwn(vector, 'value')) action.value = typeof vector.value === 'string' ? vector.value.repeat(vector.repeat ?? 1) : vector.value
    if (vector.accepted) assert.deepEqual(validateActions([action]), [action])
    else assert.throws(() => validateActions([action]), JSON.stringify(vector))
  }
})

for (const broken of [false, true]) test('real browser executes whitespace fill and ' + (broken ? 'rejects blank submission' : 'verifies ignored blank submission'), async () => {
  const scratch = await mkdtemp(join(tmpdir(), 'codeless-fill-input-'))
  const artifactRoot = join(scratch, 'artifacts'), evidenceRoot = join(scratch, 'evidence')
  await mkdir(artifactRoot); await mkdir(evidenceRoot)
  let service
  try {
    const fixture = await completedFixture(artifactRoot, {
      html: '<!doctype html><div id="app"><h1>Form fixture</h1><input data-testid="input"><button>Add</button><p data-testid="count">0</p></div><script src="/page.js"></script>',
      js: `document.querySelector('button').onclick=()=>{if(${broken}||document.querySelector('input').value.trim())document.querySelector('p').textContent='1'}`
    })
    service = await openArtifactService({ artifactRoot, ...fixture })
    const verify = await createBrowserVerifier({ evidenceRoot })
    const result = await verify(service, [
      { type: 'fill', target: { testId: 'input' }, value: ' \u00a0 ' },
      { type: 'click', target: { role: 'button', name: 'Add' } },
      { type: 'expectText', target: { testId: 'count' }, value: '0' }
    ])
    assert.equal(result.status, broken ? 'FAILED' : 'PASSED', JSON.stringify(result))
    if (broken) assert.equal(result.failure, 'ACTION_FAILED')
  } finally {
    await service?.close()
    assert.equal(dirname(scratch), resolve(tmpdir()))
    await rm(scratch, { recursive: true, force: true })
  }
})
