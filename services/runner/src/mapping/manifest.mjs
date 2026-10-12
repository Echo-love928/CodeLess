import { isDeepStrictEqual } from 'node:util'
import { readSnapshot, isDigest } from '../artifacts/snapshot.mjs'

export const PROTOCOL = 'codeless-component-mapping/v1'
export const reasons = Object.freeze(['UNSUPPORTED_TEMPLATE', 'UNSUPPORTED_ROOT', 'UNSAFE_MARKER',
  'MISSING_COMPONENT_ID', 'INVALID_COMPONENT_ID', 'DUPLICATE_COMPONENT_ID'])
const uuid = value => typeof value === 'string' && value.length === 36 && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value)
const sha = value => typeof value === 'string' && value.length === 71 && isDigest(value)
const id = value => typeof value === 'string' && value.length <= 64 && !/\s/.test(value) && /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(value)
export function sourcePath(value) {
  return typeof value === 'string' && value.length <= 240 && !/\s/.test(value) &&
    /^src\/(?:pages|components)\/[A-Za-z][A-Za-z0-9_-]*\.vue$/.test(value) &&
    !/^(?:CON|PRN|AUX|NUL|CONIN|CONOUT|COM[0-9]+|LPT[0-9]+)$/i.test(value.split('/').at(-1).slice(0, -4))
}
function reject(code) { const error = new Error(code); error.code = code; throw error }
function keys(value, names) {
  return value && typeof value === 'object' && !Array.isArray(value) &&
    isDeepStrictEqual(Object.keys(value).sort(), [...names].sort())
}
function identity(versionId, sourceDigest) {
  if (!uuid(versionId) || !sha(sourceDigest)) reject('INVALID_MAPPING_IDENTITY')
}

// Only called with the catalog from the pinned trusted build and the server-owned
// immutable snapshot. A client-supplied catalog is not a trusted producer.
export function bindCatalog({ catalog, sourceManifest, versionId, sourceDigest }) {
  identity(versionId, sourceDigest)
  if (sourceManifest?.digest !== sourceDigest) reject('SOURCE_DIGEST_MISMATCH')
  if (!keys(catalog, ['protocol', 'files']) || catalog.protocol !== 'codeless-component-catalog/v1' ||
      !Array.isArray(catalog.files) || catalog.files.length > 43) reject('INVALID_BUILD_CATALOG')
  const paths = new Set(), ids = new Map()
  for (const file of catalog.files) {
    if (!keys(file, ['sourceFile', 'fileDigest', 'componentId', 'disabledReason']) ||
        !sourcePath(file.sourceFile) || !sha(file.fileDigest) ||
        (file.componentId !== null && !id(file.componentId)) ||
        (file.disabledReason !== null && !reasons.includes(file.disabledReason)) ||
        (!file.disabledReason && !file.componentId) || paths.has(file.sourceFile.toLowerCase())) reject('INVALID_BUILD_CATALOG')
    paths.add(file.sourceFile.toLowerCase())
    if (file.componentId) ids.set(file.componentId, (ids.get(file.componentId) ?? 0) + 1)
  }
  const components = [], disabled = []
  for (const source of sourceManifest.files) {
    if (!source.path.endsWith('.vue')) continue
    if (!sourcePath(source.path)) reject('INVALID_SOURCE_PATH')
    const file = catalog.files.find(file => file.sourceFile === source.path)
    if (!file || file.fileDigest !== source.digest) reject('CATALOG_SOURCE_MISMATCH')
    const reason = ids.get(file.componentId) > 1 ? 'DUPLICATE_COMPONENT_ID' : file.disabledReason
    if (reason) disabled.push({ sourceFile: source.path, componentId: file.componentId, reason })
    else components.push({ componentId: file.componentId, sourceFile: source.path, fileDigest: source.digest, scope: 'SOURCE_FILE' })
  }
  const order = (a, b) => a.sourceFile < b.sourceFile ? -1 : a.sourceFile > b.sourceFile ? 1 : 0
  const manifest = { protocol: PROTOCOL, versionId, sourceDigest, components: components.sort(order), disabled: disabled.sort(order) }
  validateManifest(manifest)
  return manifest
}

export function validateManifest(manifest, trusted) {
  if (!keys(manifest, ['protocol', 'versionId', 'sourceDigest', 'components', 'disabled']) || manifest.protocol !== PROTOCOL ||
      !Array.isArray(manifest.components) || !Array.isArray(manifest.disabled) ||
      manifest.components.length + manifest.disabled.length > 40) reject('INVALID_MAPPING')
  identity(manifest.versionId, manifest.sourceDigest)
  const paths = new Set(), ids = new Set()
  for (const file of manifest.components) {
    if (!keys(file, ['componentId', 'sourceFile', 'fileDigest', 'scope']) || !id(file.componentId) ||
        !sourcePath(file.sourceFile) || !sha(file.fileDigest) || file.scope !== 'SOURCE_FILE' ||
        ids.has(file.componentId)) reject('INVALID_MAPPING')
    ids.add(file.componentId)
    if (paths.has(file.sourceFile.toLowerCase())) reject('INVALID_MAPPING')
    paths.add(file.sourceFile.toLowerCase())
  }
  for (const file of manifest.disabled) {
    if (!keys(file, ['sourceFile', 'componentId', 'reason']) || !sourcePath(file.sourceFile) ||
        (file.componentId !== null && !id(file.componentId)) || !reasons.includes(file.reason) ||
        paths.has(file.sourceFile.toLowerCase()) || (file.componentId && ids.has(file.componentId))) reject('INVALID_MAPPING')
    paths.add(file.sourceFile.toLowerCase())
  }
  // Structural validation alone never authenticates paths or component ownership.
  if (trusted !== undefined) {
    validateManifest(trusted)
    if (!isDeepStrictEqual(manifest, trusted)) reject('MAPPING_TAMPERED')
  }
  return manifest
}

// No incoming source path, instance index or DOM selector is accepted. Caller owns
// authorization, cancellation and the version lock before it creates a new draft.
export function resolveSelection(manifest, request) {
  validateManifest(manifest)
  if (!keys(request, ['versionId', 'sourceDigest', 'componentId'])) return { selectable: false, reason: 'INVALID_SELECTION' }
  if (request.versionId !== manifest.versionId) return { selectable: false, reason: 'VERSION_MISMATCH' }
  if (request.sourceDigest !== manifest.sourceDigest) return { selectable: false, reason: 'SOURCE_DIGEST_MISMATCH' }
  if (!request.componentId) return { selectable: false, reason: 'MISSING_COMPONENT_ID' }
  if (!id(request.componentId)) return { selectable: false, reason: 'INVALID_COMPONENT_ID' }
  const blocked = manifest.disabled.find(file => file.componentId === request.componentId)
  if (blocked) return { selectable: false, reason: blocked.reason }
  const file = manifest.components.find(file => file.componentId === request.componentId)
  if (!file) return { selectable: false, reason: 'UNKNOWN_COMPONENT_ID' }
  return { selectable: true, versionId: manifest.versionId, sourceDigest: manifest.sourceDigest, ...file,
    shared: true, notice: '修改此源码组件会影响该版本中的所有实例；不支持仅修改某个 DOM 实例。' }
}

// Integrates the existing D07 worker without mutating its immutable artifact store
// or adding shell/environment controls to request data. Returned mapping is a
// version sidecar; the API maintainer must freeze it with the D11 version.
export async function buildVersionMapping({ sourceDirectory, versionId, sourceDigest, runBuild }) {
  identity(versionId, sourceDigest)
  const before = await readSnapshot(sourceDirectory, { source: true, files: 40, bytes: 524288, fileBytes: 131072 })
  if (before.manifest.digest !== sourceDigest) reject('SOURCE_DIGEST_MISMATCH')
  const build = await runBuild(sourceDirectory)
  if (build.status !== 'SUCCEEDED' || build.exitCode !== 0 || !build.artifact ||
      !build.cleanup?.containerRemoved || !build.cleanup?.workspaceRemoved || build.cleanup.errors.length) {
    return { status: 'BUILD_FAILED', build, manifest: null }
  }
  const after = await readSnapshot(sourceDirectory, { source: true, files: 40, bytes: 524288, fileBytes: 131072 })
  if (after.manifest.digest !== sourceDigest) reject('SOURCE_CHANGED_DURING_BUILD')
  const artifacts = await readSnapshot(build.artifact.directory)
  if (artifacts.manifest.digest !== build.artifact.digest) reject('ARTIFACT_DIGEST_MISMATCH')
  const bytes = artifacts.buffers.get('ai-component-catalog.json')
  if (!bytes || bytes.length > 32768) reject('BUILD_CATALOG_UNAVAILABLE')
  const catalog = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes))
  const manifest = bindCatalog({ catalog, sourceManifest: before.manifest, versionId, sourceDigest })
  return { status: 'MAPPED', build, manifest }
}
