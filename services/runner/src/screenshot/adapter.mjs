// Host adapter, not a listening HTTP server. The API maintainer must supply an
// owner-scoped authoritative lookup on EVERY read and register the routes.
export function createCoverAdapter({ queue, ownedPublication }) {
  async function authorize(owner, id) {
    const publication = await ownedPublication(owner, id)
    if (!publication || publication.id !== id || publication.status !== 'PUBLISHED') throw new Error('NOT_FOUND')
    const record = queue.get(id)
    if (!record || record.applicationId !== publication.applicationId || record.versionId !== publication.versionId ||
        record.sourceDigest !== publication.sourceDigest || record.artifactDigest !== publication.artifactDigest ||
        (record.entryPath === undefined ? '/' : record.entryPath) !== (publication.entryPath === undefined ? '/' : publication.entryPath)) throw new Error('NOT_FOUND')
    return record
  }
  return {
    async record(owner, id) { return authorize(owner, id) },
    async image(owner, id, imageDigest) {
      const record = await authorize(owner, id)
      if (record.status !== 'SUCCEEDED' || imageDigest !== record.imageDigest) throw new Error('NOT_FOUND')
      return queue.image(id)
    },
  }
}
