// Extends the existing runner gate without editing shared package scripts or CI.
import { spawnSync } from 'node:child_process'

// node --test runs infra files concurrently; this file must not depend on template.test finishing first.
const image = spawnSync('docker', ['build', '--file', 'infra/build-image/Dockerfile', '--tag', 'codeless-vue-build:d05', '.'], {
  stdio: 'inherit', timeout: 180000
})
if (image.error) throw image.error
if (image.status !== 0) throw new Error(`trusted Vue image build exited ${image.status ?? 'unknown'}`)

await import('../runner/build/acceptance.test.mjs')
