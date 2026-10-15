import { createPublicationStore } from './store.mjs'
import { dirname, join } from 'node:path'
import { isDeepStrictEqual } from 'node:util'
import { browserTarget } from '../artifacts/service.mjs'
import { digest, readSnapshot } from '../artifacts/snapshot.mjs'
import { canonical } from '../preview/registry.mjs'
import { uuid } from '../preview/credentials.mjs'
import { deploymentUrl, publicationSite, publicFile } from './policy.mjs'

// Private API for the authenticated publication coordinator. Never exposed as an HTTP tool.
// The coordinator supplies its committed immutable version and live worker-owned handle.
export async function createPublisher({ hostingRoot, evidenceRoot, publicOrigin, platformOrigin, previewOrigin }) {
  const store = await createPublicationStore(hostingRoot)
  const evidence = await canonical(evidenceRoot)
  const { site } = publicationSite(publicOrigin, platformOrigin, previewOrigin)
  const pending = new Map()
  async function publish(job) {
    const deadlineMs = job.deadline ? Date.parse(job.deadline) : Date.now() + 30000
    if (!Number.isFinite(deadlineMs) || deadlineMs - Date.now() <= 3000 || deadlineMs - Date.now() > 30000) throw new Error('DEPLOYMENT_TIMEOUT')
    const { deploymentId, version, handle, verification } = job
    const target = browserTarget(handle) // Serialized/modeled handles cannot grant access.
    if (!uuid.test(deploymentId ?? '') || !version || !uuid.test(version.id ?? '') ||
      !uuid.test(version.applicationId ?? '') || version.status !== 'VERIFIED' ||
      version.buildId !== handle.buildId || version.sourceDigest !== handle.sourceDigest ||
      verification?.status !== 'PASSED' || verification.failure !== null || verification.workerExitCode !== 0 ||
      verification.timedOut !== false || verification.cleanup?.browserClosed !== true || !verification.screenshot ||
      verification.buildId !== handle.buildId || verification.sourceDigest !== handle.sourceDigest ||
      verification.artifactDigest !== handle.artifactDigest) throw new Error('verified immutable binding required')
    const reportPath = join(evidence, verification.id ?? '', 'result.json')
    const screenshotPath = join(evidence, verification.id ?? '', 'page.png')
    if (!uuid.test(verification.id ?? '') || verification.reportPath !== reportPath ||
      verification.screenshot.path !== screenshotPath) throw new Error('untrusted verification paths')
    await canonical(dirname(reportPath))
    const observed = await readSnapshot(dirname(reportPath), { files: 4, bytes: 8 * 1024 * 1024 })
    const png = observed.buffers.get('page.png')
    if (!isDeepStrictEqual(JSON.parse(observed.buffers.get('result.json')?.toString('utf8') ?? 'null'), verification) ||
      !png || digest(png) !== verification.screenshot.digest || png.length !== verification.screenshot.bytes ||
      png.length < 24 || !png.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) ||
      png.readUInt32BE(16) !== 1280 || png.readUInt32BE(20) !== 720)
      throw new Error('verification evidence mismatch')
    const binding = { deploymentId, applicationId: version.applicationId, versionId: version.id,
      buildId: handle.buildId, sourceDigest: handle.sourceDigest, artifactDigest: handle.artifactDigest }
    const buffers = new Map(), files = []
    const deadline = AbortSignal.timeout(Math.max(1, deadlineMs - Date.now() - 3000))
    let total = 0
    // Read the admitted immutable service, not mutable disk or a user-provided path/upstream.
    for (const name of target.paths.sort()) {
      const response = await fetch(target.origin + '/' + name, { redirect: 'error',
        signal: AbortSignal.any([deadline, AbortSignal.timeout(3000)]), headers: { 'X-Codeless-Artifact-Token': target.token } })
      if (!response.ok || Number(response.headers.get('content-length')) > 32 * 1024 * 1024) throw new Error('artifact read failed')
      const chunks = []
      for await (const chunk of response.body) {
        total += chunk.length
        if (total > 32 * 1024 * 1024) throw new Error('artifact size exceeded')
        chunks.push(chunk)
      }
      const bytes = Buffer.concat(chunks)
      files.push({ path: name, bytes: bytes.length, digest: digest(bytes) })
      if (publicFile(name)) buffers.set(name, bytes)
    }
    if (digest(JSON.stringify(files)) !== handle.artifactDigest || !buffers.has('index.html') ||
      ![...buffers.keys()].some(name => name.endsWith('.js'))) throw new Error('artifact binding mismatch')
    const publishedFiles = Object.freeze(files.filter(file => publicFile(file.path)).map(file => Object.freeze(file)))
    const receipt = Object.freeze({ ...binding, publishedDigest: digest(JSON.stringify(publishedFiles)), files: publishedFiles,
      url: deploymentUrl(deploymentId, site) })
    return store(receipt, buffers, deadlineMs - 3000)
  }
  return job => {
    const key = job?.deploymentId
    if (!uuid.test(key ?? '')) return Promise.reject(new Error('invalid deployment ID'))
    // Serialize same-ID calls, revalidate every binding; do not reuse another caller's result.
    const frozen = { deploymentId: key, version: structuredClone(job.version),
      verification: structuredClone(job.verification), handle: job.handle, deadline: job.deadline }
    const run = (pending.get(key) ?? Promise.resolve()).catch(() => {}).then(() => publish(frozen))
    pending.set(key, run)
    void run.finally(() => { if (pending.get(key) === run) pending.delete(key) }).catch(() => {})
    return run
  }
}
