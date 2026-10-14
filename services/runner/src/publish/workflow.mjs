import { createPublisher } from './publisher.mjs'
import { createPublicProbe } from './probe.mjs'

// D15-A calls only after committed owner authorization and immutable-version admission.
// This worker returns evidence, never updates SQL or an application's successful publication pointer.
export async function createPublicationRunner(config) {
  const publish = await createPublisher(config)
  const probe = createPublicProbe(config)
  return async job => {
    let receipt = null
    try {
      receipt = await publish(job)
      const observation = await probe(receipt)
      if (observation.status !== 'PASSED' || observation.exitCode !== 0 || observation.cleanup !== true)
        return { deploymentId: job.deploymentId, versionId: job.version.id, status: 'FAILED',
          failure: observation.failure ?? 'PROBE_FAILED', receipt, probe: observation, url: null }
      return { deploymentId: receipt.deploymentId, applicationId: receipt.applicationId, versionId: receipt.versionId,
        status: 'PUBLISHED', failure: null, receipt, probe: observation, url: receipt.url }
    } catch (error) {
      return { deploymentId: job.deploymentId, versionId: job.version?.id ?? null, status: 'FAILED',
        failure: receipt ? 'PUBLIC_PROBE_UNAVAILABLE' : 'PUBLICATION_REJECTED', receipt, probe: null, url: null,
        diagnostic: error.message.slice(0, 200) }
    }
  }
}
