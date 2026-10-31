import cp from 'node:child_process'
import { syncBuiltinESMExports } from 'node:module'
import { appendFileSync } from 'node:fs'
const original = cp.spawnSync
cp.spawnSync = function (...args) {
  const stage = args[1]?.find(value => /^verify:(static|api|runner|e2e)$/.test(value))
  const startedAt = new Date().toISOString()
  const result = original.apply(this, args)
  if (stage && process.env.D26_STAGE_EXITS) appendFileSync(process.env.D26_STAGE_EXITS,
    JSON.stringify({ stage, startedAt, completedAt: new Date().toISOString(), exitCode: result.status,
      signal: result.signal, launchError: result.error?.code ?? null }) + '\n')
  return result
}
syncBuiltinESMExports()
