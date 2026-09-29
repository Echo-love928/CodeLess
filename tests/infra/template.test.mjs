import { spawnSync } from 'node:child_process'

const image = spawnSync('docker', ['build', '--file', 'infra/build-image/Dockerfile', '--tag', 'codeless-vue-build:d05', '.'], {
  stdio: 'inherit',
  timeout: 180000
})
if (image.error) throw image.error
if (image.status !== 0) throw new Error(`trusted Vue image build exited ${image.status ?? 'unknown'}`)

await import('../runner/template/acceptance.test.mjs')
