import { digest, isDigest, readSnapshot } from '../artifacts/snapshot.mjs'
import { uuid } from '../preview/credentials.mjs'
import { canonical } from '../preview/registry.mjs'
import { join } from 'node:path'
import { isDeepStrictEqual } from 'node:util'
import { deploymentUrl, publicationSite, publicFile } from './policy.mjs'
import { createPublicationStore } from './store.mjs'
import { createPublicProbe } from './probe.mjs'

// Private coordinator API, not an HTTP/model tool. A owns authorization and the
// PASSED build/report binding. This independent boundary rehashes every byte it
// actually receives; it never reconstitutes a D08 WeakMap handle or accepts paths.
export function frozenPayload(payload) {
  if (!payload || Object.keys(payload).sort().join(',') !== 'artifactDigest,assets,publicationId,versionId' ||
    !uuid.test(payload.publicationId ?? '') || !uuid.test(payload.versionId ?? '') ||
    !isDigest(payload.artifactDigest) || !Array.isArray(payload.assets) || !payload.assets.length || payload.assets.length > 2000)
    throw new Error('invalid frozen payload')
  let total = 0
  const buffers = new Map(), names = new Set(), files = []
  for (const asset of payload.assets) {
    const name = asset.path
    if (Object.keys(asset).sort().join(',') !== 'bytes,digest,path' || typeof name !== 'string' || name.length > 240 || !/^[A-Za-z0-9_./-]+$/.test(name) ||
      name.split('/').some(part => !part || part === '.' || part === '..' || part.endsWith('.') || /^(?:CON|PRN|AUX|NUL|COM[0-9]+|LPT[0-9]+)(?:\.|$)/i.test(part)) ||
      names.has(name.toLowerCase()) || !isDigest(asset.digest) || typeof asset.bytes !== 'string' ||
      asset.bytes.length > 44739244)
      throw new Error('invalid frozen asset')
    names.add(name.toLowerCase())
    const bytes = Buffer.from(asset.bytes, 'base64')
    if (bytes.toString('base64') !== asset.bytes) throw new Error('invalid frozen asset encoding')
    total += bytes.length
    if (total > 32 * 1024 * 1024 || digest(bytes) !== asset.digest) throw new Error('frozen asset digest mismatch')
    files.push({ path: name, bytes: bytes.length, digest: asset.digest })
    if (publicFile(name)) buffers.set(name, bytes)
  }
  files.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0)
  if (digest(JSON.stringify(files)) !== payload.artifactDigest || !buffers.has('index.html') || ![...buffers.keys()].some(name => name.endsWith('.js')))
    throw new Error('frozen manifest mismatch')
  return { publicationId: payload.publicationId, versionId: payload.versionId, artifactDigest: payload.artifactDigest,
    buffers, files: files.filter(file => publicFile(file.path)) }
}
export function deploymentDeadline(value) {
  const deadline = Date.parse(value), remaining = deadline - Date.now()
  if (!Number.isFinite(deadline) || remaining <= 3000 || remaining > 30000) throw new Error('DEPLOYMENT_TIMEOUT')
  return deadline
}
export async function createFrozenGateway(config) {
  const store = await createPublicationStore(config.hostingRoot)
  const { site } = publicationSite(config.publicOrigin, config.platformOrigin, config.previewOrigin)
  const probe = createPublicProbe(config)
  function receipt(binding) {
    return { deploymentId: binding.publicationId, versionId: binding.versionId, artifactDigest: binding.artifactDigest,
      publishedDigest: digest(JSON.stringify(binding.files)), files: binding.files, url: deploymentUrl(binding.publicationId, site) }
  }
  return {
    async publish(payload, deadlineValue) {
      const deadline = deploymentDeadline(deadlineValue), binding = frozenPayload(payload)
      const result = await store(receipt(binding), binding.buffers, deadline - 3000)
      return { url: result.url }
    },
    async probe(payload, url, deadlineValue) {
      const deadline = deploymentDeadline(deadlineValue), binding = frozenPayload(payload), expected = receipt(binding)
      if (url !== expected.url) throw new Error('probe deployment binding rejected')
      const root = await canonical(config.hostingRoot), directory = join(root, binding.publicationId)
      await canonical(directory)
      const snapshot = await readSnapshot(directory, { files: 2001, bytes: 33 * 1024 * 1024 })
      if (!isDeepStrictEqual(JSON.parse(snapshot.buffers.get('__deployment.json')?.toString() ?? 'null'), expected) ||
        snapshot.buffers.size !== binding.files.length + 1 || binding.files.some(file => digest(snapshot.buffers.get(file.path) ?? '') !== file.digest))
        throw new Error('stored publication binding mismatch')
      const observation = await probe(expected, deadline)
      return { accessible: observation.status === 'PASSED' && observation.exitCode === 0 && observation.cleanup === true,
        versionId: binding.versionId, artifactDigest: binding.artifactDigest, observation }
    },
  }
}
