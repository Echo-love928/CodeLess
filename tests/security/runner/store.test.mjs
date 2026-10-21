import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtemp, mkdir, readFile, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import { createPublicationStore } from '../../../services/runner/src/publish/store.mjs'

test('D19 T4: publication writer rejects traversal, private files, aliases and oversized input before writing', async () => {
  const root = await mkdtemp(join(tmpdir(), 'codeless-d19-store-'))
  try {
    const sites = join(root, 'sites'); await mkdir(sites)
    const store = await createPublicationStore(sites)
    const valid = () => new Map([['index.html', Buffer.from('fixture')], ['assets/app.js', Buffer.alloc(0)]])
    for (const deploymentId of ['../escaped', '/absolute', '..\\escaped', randomUUID() + '/child', randomUUID() + '\n']) {
      await assert.rejects(store({ deploymentId, files: [] }, valid()), /publication input rejected/)
    }
    for (const name of ['../escaped', 'assets/../../escaped', '/absolute', 'assets\\escape.js', 'assets/a.js:stream',
      'assets/%2e%2e.js', '.env', '__deployment.json', 'assets/CON.js', 'assets/app.js\n']) {
      const buffers = valid(); buffers.set(name, Buffer.from('evil'))
      await assert.rejects(store({ deploymentId: randomUUID(), files: [] }, buffers), /publication input rejected/)
    }
    for (const buffers of [new Map([...valid(), ['assets/a.js', Buffer.from('a')], ['assets/A.js', Buffer.from('b')]]),
      new Map([...valid(), ['index.html', Buffer.alloc(32 * 1024 * 1024 + 1)]]),
      new Map([...valid(), ['index.html', 'not bytes']]),
      new Map(Array.from({ length: 2001 }, (_, i) => [`assets/a${i}.js`, Buffer.alloc(0)]))]) {
      await assert.rejects(store({ deploymentId: randomUUID(), files: [] }, buffers), /publication input rejected/)
    }
    assert.deepEqual(await readdir(sites), [])
    assert.deepEqual((await readdir(root)).sort(), ['sites', 'sites-staging'])
  } finally {
    assert.equal(dirname(root), resolve(tmpdir())); await rm(root, { recursive: true, force: true })
  }
})

test('D19 T4: admitted bytes and receipt are frozen before asynchronous publication', async () => {
  const root = await mkdtemp(join(tmpdir(), 'codeless-d19-freeze-'))
  try {
    const sites = join(root, 'sites'); await mkdir(sites)
    const store = await createPublicationStore(sites), id = randomUUID()
    const receipt = { deploymentId: id, files: [] }, bytes = Buffer.from('original')
    const buffers = new Map([['index.html', bytes], ['assets/app.js', Buffer.alloc(0)]])
    const publishing = store(receipt, buffers)
    receipt.deploymentId = '../escaped'; receipt.files.push({ path: 'evil' }); bytes.fill(120); buffers.set('../escaped', Buffer.from('evil'))
    await publishing
    assert.equal(await readFile(join(sites, id, 'index.html'), 'utf8'), 'original')
    assert.deepEqual(JSON.parse(await readFile(join(sites, id, '__deployment.json'))), { deploymentId: id, files: [] })
  } finally {
    assert.equal(dirname(root), resolve(tmpdir())); await rm(root, { recursive: true, force: true })
  }
})
