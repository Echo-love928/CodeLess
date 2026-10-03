import { randomUUID } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { digest } from '../../../services/runner/src/artifacts/snapshot.mjs'
import { summarizeArtifacts } from '../../../services/runner/src/build/runner.mjs'
import { policy } from '../../../infra/runner/policy.mjs'

// Host-authored browser boundary fixture, NOT evidence of a production Vue build.
export async function completedFixture(artifactRoot, { html, js = '' } = {}) {
  const id = randomUUID()
  const directory = join(artifactRoot, id)
  await mkdir(directory, { recursive: true })
  await writeFile(join(directory, 'index.html'), html ?? '<!doctype html><div id="app"><h1>Fixture</h1></div><script src="/page.js"></script>')
  await writeFile(join(directory, 'page.js'), js)
  const artifact = { ...await summarizeArtifacts(directory, policy()), directory }
  return { build: { id, status: 'SUCCEEDED', exitCode: 0, failure: null, timedOut: false, oomKilled: false,
    completedAt: new Date().toISOString(), artifact, cleanup: { containerRemoved: true, workspaceRemoved: true, errors: [] } },
    sourceDigest: digest(JSON.stringify({ html, js })), fixture: true }
}
