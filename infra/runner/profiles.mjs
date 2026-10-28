import { policy } from './policy.mjs'

// Host-selected, opt-in calibration for the fixed Vue trial template. Generated
// task data selects no profile. Generic defaults remain available.
export const TRIAL_LIMITS = Object.freeze({ timeoutMs: 60000, logBytes: 16384 })
export function workerPolicy(profile, overrides = {}) {
  if (profile === undefined) return policy(overrides)
  if (profile !== 'trial') throw new Error('unknown worker profile')
  for (const [key, value] of Object.entries(overrides)) {
    if (Object.hasOwn(TRIAL_LIMITS, key) && value > TRIAL_LIMITS[key]) throw new Error('relaxed profile limit')
  }
  return policy({ ...TRIAL_LIMITS, ...overrides })
}
