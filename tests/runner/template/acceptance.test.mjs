import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { cp, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { build, IMAGE, validateSource } from '../../../services/runner/src/template/build.mjs'

const root = fileURLToPath(new URL('../../../', import.meta.url))
const fixture = (name) => join(root, 'templates', 'vue', 'fixtures', name)

async function withScratch(action) {
  const directory = await mkdtemp(join(tmpdir(), 'codeless-d05-'))
  try { return await action(directory) }
  finally {
    assert.equal(resolve(directory).startsWith(resolve(tmpdir())), true)
    await rm(directory, { recursive: true, force: true })
  }
}

async function allFiles(directory) {
  const result = []
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name)
    result.push(...entry.isDirectory() ? await allFiles(path) : [path])
  }
  return result
}

test('D05-B-T1: three fixtures build in the preinstalled image', { timeout: 120000 }, async () => {
  for (const name of ['showcase', 'tasks', 'catalog']) {
    await withScratch(async (scratch) => {
      const output = join(scratch, 'output')
      await build(fixture(name), output)
      assert.match(await readFile(join(output, 'index.html'), 'utf8'), /assets\/index-/)
      assert.equal((await allFiles(output)).some((file) => file.endsWith('.js')), true)
      console.log(`${name}: production artifact produced`)
    })
  }
})

test('D05-B-T2: lockfile, package changes, and unknown paths are rejected', async () => {
  await withScratch(async (scratch) => {
    const source = join(scratch, 'source')
    await cp(fixture('showcase'), source, { recursive: true })
    await writeFile(join(source, 'pnpm-lock.yaml'), 'tampered: true\n')
    await assert.rejects(validateSource(source), /unapproved source path: pnpm-lock.yaml/)
    await rm(join(source, 'pnpm-lock.yaml'))
    await writeFile(join(source, 'package.json'), '{"dependencies":{"left-pad":"1.3.0"}}')
    await assert.rejects(validateSource(source), /unapproved source path: package.json/)
    await rm(join(source, 'package.json'))
    await writeFile(join(source, 'vite.config.ts'), 'export default {}')
    await assert.rejects(validateSource(source), /unapproved source path: vite.config.ts/)
  })
})

test('build refuses to reuse an existing output directory', async () => {
  await withScratch(async (scratch) => {
    const output = join(scratch, 'output')
    await cp(fixture('showcase'), output, { recursive: true })
    await assert.rejects(build(fixture('showcase'), output), /new empty directory/)
  })
})

test('D05-B-T3: build image cannot reach package registry with network disabled', () => {
  const result = spawnSync('docker', ['run', '--rm', '--network', 'none', '--entrypoint', 'node', IMAGE,
    '-e', "fetch('https://registry.npmjs.org/vue').then(()=>process.exit(9)).catch(()=>console.log('registry unreachable'))"],
  { encoding: 'utf8', timeout: 30000 })
  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stdout, /registry unreachable/)
})

test('D05-B-T4: host development key is absent from production artifacts', { timeout: 60000 }, async () => {
  await withScratch(async (scratch) => {
    const sentinel = 'd05-development-key-must-never-ship-4b30e5'
    const old = process.env.CODELESS_MODEL_API_KEY
    process.env.CODELESS_MODEL_API_KEY = sentinel
    try {
      const output = join(scratch, 'output')
      await build(fixture('showcase'), output)
      for (const file of await allFiles(output)) {
        assert.equal((await readFile(file)).includes(sentinel), false, file)
      }
    } finally {
      if (old === undefined) delete process.env.CODELESS_MODEL_API_KEY
      else process.env.CODELESS_MODEL_API_KEY = old
    }
  })
})
