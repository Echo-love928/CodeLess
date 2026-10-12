import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { mkdtemp, mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { test } from 'node:test'
import { promoteArtifacts, summarizeArtifacts } from '../../../services/runner/src/build/runner.mjs'
import { policy } from '../../../infra/runner/policy.mjs'

async function fixture(check) {
  const root = await mkdtemp(join(tmpdir(), 'codeless-promotion-'))
  try {
    const output = join(root, 'output'), artifacts = join(root, 'artifacts')
    await mkdir(output); await mkdir(artifacts)
    await writeFile(join(output, 'index.html'), '<script src="assets/app.js"></script>')
    await mkdir(join(output, 'assets')); await writeFile(join(output, 'assets/app.js'), 'console.log("frozen")')
    await check({ output, artifacts, id: randomUUID(), limits: policy(), summary: await summarizeArtifacts(output, policy()) })
  } finally {
    assert.equal(dirname(root), resolve(tmpdir()))
    await rm(root, { recursive: true, force: true })
  }
}
const exdev = () => Object.assign(new Error('injected cross-volume rename'), { code: 'EXDEV' })

test('cross-volume promotion freezes bounded bytes and atomically publishes the same hashes', async () => fixture(async ({ output, artifacts, id, summary, limits }) => {
  let calls = 0
  const move = async (from, to) => {
    if (++calls === 1) { assert.equal(from, output); throw exdev() }
    assert.equal(dirname(from), artifacts)
    assert.equal(to, join(artifacts, id))
    // The final UUID is invisible until all frozen files are staged.
    assert.equal((await readdir(artifacts)).includes(id), false)
    await rename(from, to)
  }
  const destination = await promoteArtifacts(output, artifacts, id, summary, limits, move)
  assert.equal(calls, 2)
  assert.deepEqual(await summarizeArtifacts(destination, limits), summary)
  assert.equal(await readFile(join(destination, 'assets/app.js'), 'utf8'), 'console.log("frozen")')
  assert.deepEqual(await readdir(artifacts), [id])
}))

test('cross-volume promotion refuses changed or oversized bytes without publishing', async () => fixture(async ({ output, artifacts, id, summary, limits }) => {
  await writeFile(join(output, 'assets/app.js'), 'console.log("changed")')
  await assert.rejects(promoteArtifacts(output, artifacts, id, summary, limits, async () => { throw exdev() }), /changed/)
  await assert.rejects(promoteArtifacts(output, artifacts, id, summary, { ...limits, artifactBytes: 1 }, async () => { throw exdev() }), /limit/)
  assert.deepEqual(await readdir(artifacts), [])
}))

test('promotion preserves unrelated errors and cleans a failed private promotion', async () => fixture(async ({ output, artifacts, id, summary, limits }) => {
  const denied = Object.assign(new Error('permission denied'), { code: 'EACCES' })
  await assert.rejects(promoteArtifacts(output, artifacts, id, summary, limits, async () => { throw denied }), error => error === denied)
  let calls = 0
  await assert.rejects(promoteArtifacts(output, artifacts, id, summary, limits, async () => {
    if (++calls === 1) throw exdev()
    throw denied
  }), error => error === denied)
  assert.equal(calls, 2)
  assert.deepEqual(await readdir(artifacts), [])
}))
