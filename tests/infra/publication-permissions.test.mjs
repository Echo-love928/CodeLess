import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { test } from 'node:test'

test('publication survives private worker umask while keeping receipt and staging private', async () => {
  const root = await mkdtemp(join(tmpdir(), 'codeless-public-mode-'))
  try {
    const module = new URL('../../services/runner/src/publish/store.mjs', import.meta.url).href
    const child = spawnSync(process.execPath, ['--input-type=module', '-e', `
      import assert from 'node:assert/strict';
      import { mkdir, stat, readFile } from 'node:fs/promises';
      import { join } from 'node:path';
      import { createPublicationStore } from ${JSON.stringify(module)};
      process.umask(0o077);
      const root = process.argv[1], sites = join(root, 'sites');
      await mkdir(sites);
      const id = '12345678-1234-4234-8234-123456789012';
      const store = await createPublicationStore(sites);
      const receipt = { deploymentId: id, files: [] };
      await store(receipt, new Map([['index.html', Buffer.from('public index')], ['assets/page.js', Buffer.from('public js')]]));
      assert.equal(await readFile(join(sites, id, 'assets/page.js'), 'utf8'), 'public js');
      assert.deepEqual(JSON.parse(await readFile(join(sites, id, '__deployment.json'))), receipt);
      if (process.platform !== 'win32') {
        for (const name of ['index.html', 'assets/page.js']) assert.equal((await stat(join(sites, id, name))).mode & 0o777, 0o644);
        for (const name of ['', 'assets']) assert.equal((await stat(join(sites, id, name))).mode & 0o777, 0o755);
        assert.equal((await stat(join(sites, id, '__deployment.json'))).mode & 0o777, 0o600);
        assert.equal((await stat(join(root, 'sites-staging'))).mode & 0o777, 0o700);
      }
      console.log(JSON.stringify({ posixModesChecked: process.platform !== 'win32' }));
    `, root], { encoding: 'utf8', timeout: 10000 })
    assert.equal(child.status, 0, child.stderr)
    assert.deepEqual(JSON.parse(child.stdout), { posixModesChecked: process.platform !== 'win32' })
  } finally { await rm(root, { recursive: true, force: true }) }
})
