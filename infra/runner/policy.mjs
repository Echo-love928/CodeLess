// Worker-owned configuration; never accept these values from generated task data.
export const IMAGE = 'codeless-vue-build:d05'
export const POLICY = Object.freeze({
  timeoutMs: 120000, memoryMiB: 512, cpus: 1, pids: 128,
  tmpMiB: 256, logBytes: 65536, artifactBytes: 32 * 1024 * 1024, artifactFiles: 2000
})

export function policy(overrides = {}) {
  for (const [key, value] of Object.entries(overrides)) {
    if (!(key in POLICY) || !Number.isSafeInteger(value) || value < 1 || value > POLICY[key]) {
      throw new Error(`invalid or relaxed worker limit: ${key}`)
    }
  }
  return Object.freeze({ ...POLICY, ...overrides })
}
