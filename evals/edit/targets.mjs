import assert from 'node:assert/strict'
import { resolveSelection } from '../../services/runner/src/mapping/manifest.mjs'
import { observeTarget } from './cases.mjs'
import { inspect } from '../browser/browser.mjs'

// A marker read from generated DOM is only a candidate ID. File ownership comes
// exclusively from the catalog rebuilt from the immutable source being viewed.
export function resolveTarget(observations, mapping) {
  assert.ok(observations.length > 0)
  const ids = observations.map(value => value.candidateId)
  if (ids.some(id => !id)) return { failure: 'COMPONENT_MAPPING_UNAVAILABLE', mappingReason: 'MISSING_COMPONENT_ID' }
  const selections = ids.map(componentId => resolveSelection(mapping,
    { componentId, versionId: mapping.versionId, sourceDigest: mapping.sourceDigest }))
  const disabled = selections.find(s => !s.selectable)
  if (disabled) return { failure: 'COMPONENT_MAPPING_UNAVAILABLE', mappingReason: disabled.reason }
  if (new Set(ids).size !== 1) return { failure: 'COMPONENT_MAPPING_UNAVAILABLE', mappingReason: 'TARGET_COMPONENTS_DIFFER' }
  return { selection: selections[0] }
}

export async function probeTarget({ browser, artifact, edit, mapping, route, output, inspectPage = inspect, phase = 'before' }) {
  let observations = null
  const browserResult = await inspectPage(browser, artifact, { route, output, action: async (page, expect) => {
    observations = await observeTarget(page, edit, expect, phase)
  } })
  if (browserResult.status !== 'PASSED' || !observations)
    return { failure: browserResult.failure === 'BEHAVIOR_ERROR' ? 'LOCATOR_UNMATCHED' : 'BASE_REPLAY_FAILED', browser: browserResult }
  return { ...resolveTarget(observations, mapping), observations, browser: browserResult }
}

export const alreadyMatches = (edit, observations) => edit.kind === 'css' && observations.length > 0 &&
  observations.every(value => Object.values(value.css).every(actual => actual === edit.after))
