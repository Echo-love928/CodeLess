import { createHash } from 'node:crypto'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { delimiter, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

// Shared by the D21-A driver, report and verifier. No model, network or filesystem side effects.
export const root = fileURLToPath(new URL('../../', import.meta.url))
export const FROZEN = Object.freeze({
  requirements: 'evals/generation/requirements.json',
  faults: 'evals/generation/faults.json',
  runConfig: 'evals/generation/run-config.json'
})
export const CATEGORIES = Object.freeze(['SHOWCASE', 'TASKS', 'CATALOG'])
export const REAL_RUNS = 'evals/generation/runs'
// D25 keeps new evidence inside its authorized results scope; legacy batches remain valid.
export const REAL_RESULT_RUNS = 'evals/results/generation/runs'
export function isRealRunLocation(path, base = root) {
  const normalized = resolve(path).replaceAll('\\', '/').toLowerCase() + '/'
  return [REAL_RUNS, REAL_RESULT_RUNS].some(directory => normalized.startsWith(resolve(base, directory).replaceAll('\\', '/').toLowerCase() + '/'))
}

export const sha256 = (bytes) => 'sha256:' + createHash('sha256').update(bytes).digest('hex')
export const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'))
export const exists = (path) => existsSync(path)
export const isFile = (path) => existsSync(path) && statSync(path).isFile()

/** Loads the frozen set with the digest of its exact bytes and rejects an incomplete denominator. */
export function loadFrozen(base = root) {
  const files = {}
  for (const [key, path] of Object.entries(FROZEN)) {
    const bytes = readFileSync(join(base, path))
    files[key] = { path, sha256: sha256(bytes), value: JSON.parse(bytes.toString('utf8')) }
  }
  validateFrozen(files.requirements.value, files.faults.value)
  return files
}

export function validateFrozen(requirements, faults) {
  const ids = requirements.requirements.map((r) => r.id)
  if (requirements.policy.denominator !== 9 || ids.length !== 9) throw new Error('frozen requirement denominator must be 9')
  if (new Set(ids).size !== ids.length) throw new Error('duplicate requirement id')
  for (const category of CATEGORIES) {
    if (requirements.requirements.filter((r) => r.category === category).length !== 3) throw new Error('each category needs 3 requirements: ' + category)
  }
  for (const r of requirements.requirements) {
    if (!CATEGORIES.includes(r.category) || !['STATIC', 'MOCK', 'LOCAL_STORAGE'].includes(r.dataMode)) throw new Error('invalid requirement ' + r.id)
    if (typeof r.prompt !== 'string' || !r.prompt.trim() || typeof r.applicationName !== 'string') throw new Error('invalid requirement ' + r.id)
  }
  const code = faults.faults.filter((f) => f.class === 'CODE')
  const environment = faults.faults.filter((f) => f.class === 'ENVIRONMENT')
  if (code.length !== 3 || environment.length !== 2 || faults.faults.length !== 5) throw new Error('frozen faults must be 3 CODE + 2 ENVIRONMENT')
  const faultIds = faults.faults.map((f) => f.id)
  if (new Set([...faultIds, ...ids]).size !== faultIds.length + ids.length) throw new Error('duplicate sample id')
  for (const fault of faults.faults) {
    if (!ids.includes(fault.baseRequirement)) throw new Error('unknown base requirement for ' + fault.id)
    if (!/^HOST_/.test(fault.origin)) throw new Error('every fault must be labelled as host-injected: ' + fault.id)
  }
}

/** Planned samples in frozen order: the 9 requirements, then the 5 faults. */
export function plannedSamples(frozen) {
  const requirements = frozen.requirements.value.requirements
  const byId = new Map(requirements.map((r) => [r.id, r]))
  return [
    ...requirements.map((r) => ({ id: r.id, kind: 'REQUIREMENT', category: r.category, requirement: r, fault: null })),
    ...frozen.faults.value.faults.map((f) => ({ id: f.id, kind: f.class === 'CODE' ? 'CODE_FAULT' : 'ENV_FAULT',
      category: byId.get(f.baseRequirement).category, requirement: byId.get(f.baseRequirement), fault: f }))
  ]
}

/** Deterministic JSON text: stable for byte comparison of derived reports. */
export function canonical(value) {
  return JSON.stringify(value, null, 2) + '\n'
}

/** Removes every PATH directory that holds a container CLI; returns the removed directories. */
export function withoutContainerCli(pathValue, probe = isFile) {
  const kept = []
  const removed = []
  for (const directory of (pathValue ?? '').split(delimiter)) {
    if (!directory) continue
    const holds = ['docker', 'docker.exe', 'docker.cmd', 'docker.bat'].some((name) => probe(join(directory.trim(), name)))
    ;(holds ? removed : kept).push(directory)
  }
  return { path: kept.join(delimiter), removed }
}

export function pathKey(env) {
  return Object.keys(env).find((key) => key.toUpperCase() === 'PATH') ?? 'PATH'
}

export function relativeToRoot(path) {
  return resolve(path).slice(resolve(root).length + 1).split('\\').join('/')
}
