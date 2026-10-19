import { lookup } from 'node:dns/promises'
import { join } from 'node:path'
import { canonical } from '../preview/registry.mjs'
import { uuid } from '../preview/credentials.mjs'
import { readSnapshot, digest, isDigest } from '../artifacts/snapshot.mjs'
import { deploymentUrl, publicationSite, publicAddress, publicFile } from '../publish/policy.mjs'

// Only the private coordinator can supply lookupDeployment. No caller-supplied URL or path.
export function createTargetResolver(config, resolveDns = lookup) {
  const { site } = publicationSite(config.publicOrigin, config.platformOrigin, config.previewOrigin)
  return async function resolveTarget(deploymentId, signal) {
    if (typeof deploymentId !== 'string' || !uuid.test(deploymentId)) throw new Error('TARGET_REJECTED')
    const publication = structuredClone(await config.lookupDeployment(deploymentId, signal))
    const url = deploymentUrl(deploymentId, site)
    if (!publication || publication.id !== deploymentId || publication.status !== 'PUBLISHED' || publication.url !== url ||
        !uuid.test(publication.applicationId ?? '') || !uuid.test(publication.versionId ?? '') ||
        !isDigest(publication.sourceDigest) || !isDigest(publication.artifactDigest)) throw new Error('TARGET_REJECTED')
    const root = await canonical(config.hostingRoot), directory = join(root, deploymentId)
    await canonical(directory)
    const snapshot = await readSnapshot(directory, { files: 2001, bytes: 33 * 1024 * 1024 })
    const receipt = JSON.parse(snapshot.buffers.get('__deployment.json')?.toString('utf8') ?? 'null')
    if (!receipt || receipt.deploymentId !== deploymentId || receipt.versionId !== publication.versionId || receipt.url !== url ||
        receipt.artifactDigest !== publication.artifactDigest || !Array.isArray(receipt.files) || !receipt.files.length ||
        receipt.files.length > 2000 || receipt.publishedDigest !== digest(JSON.stringify(receipt.files)) ||
        snapshot.buffers.size !== receipt.files.length + 1 || new Set(receipt.files.map(file => file.path)).size !== receipt.files.length ||
        receipt.files.some(file => !publicFile(file.path) || !Number.isSafeInteger(file.bytes) || file.bytes < 0 ||
          !isDigest(file.digest) || snapshot.buffers.get(file.path)?.length !== file.bytes ||
          digest(snapshot.buffers.get(file.path) ?? '') !== file.digest) ||
        !receipt.files.some(file => file.path === 'index.html') || !receipt.files.some(file => file.path.endsWith('.js')))
      throw new Error('TARGET_REJECTED')
    signal?.throwIfAborted()
    // Validate every answer; pin a public IPv4 for every HTTPS connection in the worker.
    const records = await resolveDns(new URL(url).hostname, { all: true, verbatim: true })
    signal?.throwIfAborted()
    if (!records.length || records.some(record => !publicAddress(record.address))) throw new Error('TARGET_REJECTED')
    return Object.freeze({ deploymentId, applicationId: publication.applicationId, versionId: publication.versionId,
      sourceDigest: publication.sourceDigest, artifactDigest: publication.artifactDigest, url,
      files: receipt.files, address: records[0].address })
  }
}
