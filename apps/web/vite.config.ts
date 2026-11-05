import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
const root = fileURLToPath(new URL('../../', import.meta.url))
function buildVersion() {
  let commit = process.env.CODELESS_BUILD_COMMIT || 'development', dirty = false
  try {
    if (!process.env.CODELESS_BUILD_COMMIT) commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim()
    dirty = !!execFileSync('git', ['status', '--porcelain', '--untracked-files=no'], { cwd: root, encoding: 'utf8' }).trim()
  } catch { /* Exported source archives supply CODELESS_BUILD_COMMIT explicitly. */ }
  return { commit, builtAt: new Date().toISOString(), dirty }
}

export default defineConfig({
  plugins: [vue(), { name: 'codeless-build-version', generateBundle() {
    this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify(buildVersion()) + '\n' })
  } }],
  server: {
    proxy: {
      '/api/': {
        target: 'http://127.0.0.1:8080',
        changeOrigin: true,
      },
    },
  },
})
