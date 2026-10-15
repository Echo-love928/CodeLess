import { writeFile, stat } from 'node:fs/promises'
import { isAbsolute } from 'node:path'
import { hostingConfig } from './render.mjs'
import { previewOrigins } from '../../services/runner/src/preview/credentials.mjs'

// Operator invocation only; no publish request or success record is created here.
const env = process.env
previewOrigins(env.CODELESS_PREVIEW_ORIGIN, env.CODELESS_PLATFORM_ORIGIN)
for (const key of ['CODELESS_HOSTING_CONFIG', 'CODELESS_PLATFORM_CONFIG', 'CODELESS_HOSTING_ROOT'])
  if (!env[key] || !isAbsolute(env[key])) throw new Error(key + ': absolute path required')
if (!(await stat(env.CODELESS_HOSTING_ROOT)).isDirectory()) throw new Error('existing hosting directory required')
const config = await hostingConfig({ publicOrigin: env.CODELESS_PUBLICATION_ORIGIN,
  platformOrigin: env.CODELESS_PLATFORM_ORIGIN, previewOrigin: env.CODELESS_PREVIEW_ORIGIN })
await writeFile(env.CODELESS_HOSTING_CONFIG, config, { mode: 0o600 })
await writeFile(env.CODELESS_PLATFORM_CONFIG, JSON.stringify({ publicOrigin: env.CODELESS_PUBLICATION_ORIGIN }) + '\n', { mode: 0o644 })
console.log('Prepared ingress and platform configuration. Grant ingress UID101 read access using operator-managed ACLs; run preflight before enabling.')
