// Corresponding D12 test entry: extends the established runner gate, without
// modifying shared scripts, dependencies or CI. Each infra test is independent.
import { spawnSync } from 'node:child_process'
const image = spawnSync('docker', ['build', '--file', 'infra/build-image/Dockerfile', '--tag', 'codeless-vue-build:d05', '.'], {
  stdio: 'inherit', timeout: 180000,
})
if (image.error) throw image.error
if (image.status !== 0) throw new Error(`trusted mapping image build exited ${image.status ?? 'unknown'}`)
await import('../runner/mapping/contracts.test.mjs')
await import('../runner/mapping/acceptance.test.mjs')
