import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createBuildRunner } from '../build/runner.mjs'
import { validateSource } from '../template/build.mjs'
import { readSnapshot } from '../artifacts/snapshot.mjs'
import { openArtifactService } from '../artifacts/service.mjs'
import { createBrowserVerifier } from './verifier.mjs'
import { validateActions } from './actions.mjs'

// A-facing integration: freeze the allowed files, hash those exact bytes, then really build and verify them.
export async function createBuildVerifier({ workRoot, artifactRoot, evidenceRoot, limits } = {}) {
  if (!workRoot || !artifactRoot || !evidenceRoot) throw new Error('worker roots required')
  const root = resolve(workRoot)
  await mkdir(root, { recursive: true })
  const build = await createBuildRunner({ workRoot: join(root, 'build'), artifactRoot })
  const verify = await createBrowserVerifier({ evidenceRoot, limits })
  return async function buildAndVerify(sourceDirectory, requestedActions = []) {
    const actions = validateActions(requestedActions)
    const scratch = await mkdtemp(join(root, 'source-'))
    let service
    try {
      const { buffers, manifest } = await readSnapshot(sourceDirectory,
        { source: true, files: 40, bytes: 512 * 1024, fileBytes: 128 * 1024 })
      for (const [name, bytes] of buffers) {
        const path = join(scratch, name)
        await mkdir(dirname(path), { recursive: true })
        await writeFile(path, bytes, { flag: 'wx' })
      }
      await validateSource(scratch)
      const observedBuild = await build(scratch)
      if (observedBuild.status !== 'SUCCEEDED') {
        return { status: 'FAILED', sourceDigest: manifest.digest, build: observedBuild, verification: null }
      }
      service = await openArtifactService({ artifactRoot, build: observedBuild, sourceDigest: manifest.digest })
      const verification = await verify(service, actions)
      return { status: verification.status === 'PASSED' ? 'VERIFIED' : 'FAILED',
        sourceDigest: manifest.digest, build: observedBuild, verification }
    } finally {
      try { if (service) await service.close() }
      finally {
        if (dirname(scratch) !== root) throw new Error('source cleanup escaped worker root')
        await rm(scratch, { recursive: true, force: true })
      }
    }
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  if (process.argv.length !== 6) {
    console.error('Usage: node workflow.mjs <source> <work-root> <artifact-root> <evidence-root>')
    process.exitCode = 2
  } else {
    createBuildVerifier({ workRoot: process.argv[3], artifactRoot: process.argv[4], evidenceRoot: process.argv[5] })
      .then((run) => run(process.argv[2]))
      .then((result) => { console.log(JSON.stringify(result, null, 2)); process.exitCode = result.status === 'VERIFIED' ? 0 : 1 })
      .catch((error) => { console.error(error.message); process.exitCode = 1 })
  }
}
