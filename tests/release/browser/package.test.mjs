import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, rm, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { inventory, verify, build } from '../../../infra/release/client/package.mjs'
const commit = 'a'.repeat(40)

test('release verifier rejects tamper, unexpected commit, missing and extra files', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'd27-release-'))
  try {
    await mkdir(join(dir, 'web'))
    await writeFile(join(dir, 'web/index.html'), '<html>release</html>')
    await writeFile(join(dir, 'runner.tar'), 'fixture archive')
    const manifest = { schema: 1, commit, files: await inventory(dir) }
    await writeFile(join(dir, 'manifest.json'), JSON.stringify(manifest))
    await verify(dir, commit)
    await assert.rejects(verify(dir, 'b'.repeat(40)), /Unexpected candidate/)
    await writeFile(join(dir, 'extra'), 'untracked')
    await assert.rejects(verify(dir, commit), /Missing, extra or changed/)
    await rm(join(dir, 'extra'))
    await writeFile(join(dir, 'runner.tar'), 'changed')
    await assert.rejects(verify(dir, commit), /Missing, extra or changed/)
    await rm(join(dir, 'runner.tar'))
    await assert.rejects(verify(dir, commit), /Missing, extra or changed/)
  } finally { await rm(dir, { recursive: true, force: true }) }
})

test('build rejects movable refs before creating output', async () => {
  await assert.rejects(build('main', 'unused'), /Full immutable commit/)
})

test('formal ingress keeps private APIs and platform cookies off generated hosts', async () => {
  const { publicConfiguration } = await import('../../../infra/public/render.mjs')
  const config = JSON.parse(await readFile(new URL('../../../infra/release/client/config.json', import.meta.url)))
  const result = await publicConfiguration({ CODELESS_PLATFORM_ORIGIN: config.platformOrigin,
    CODELESS_PREVIEW_ORIGIN: config.previewOrigin, CODELESS_PUBLICATION_ORIGIN: config.publicOrigin })
  assert.match(result.edge, /default 127\.0\.0\.1:9/)
  assert.match(result.platform, /location \^~ \/internal\/ \{ return 404; \}/)
  assert.match(result.platform, /try_files \$uri \/index\.html/)
  assert.match(result.platform, /proxy_set_header Authorization ""/)
  assert.match(result.platform, /error_log \/dev\/null/)
  await assert.rejects(publicConfiguration({ CODELESS_PLATFORM_ORIGIN: config.platformOrigin,
    CODELESS_PREVIEW_ORIGIN: config.platformOrigin, CODELESS_PUBLICATION_ORIGIN: config.publicOrigin }))
})
