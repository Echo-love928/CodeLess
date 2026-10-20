import { fileURLToPath } from 'node:url'
const target = process.env.CODELESS_ADMIN_LIVE_API_ORIGIN
if (!target || new URL(target).hostname !== '127.0.0.1') throw new Error('Dedicated loopback API required')
export default { root: fileURLToPath(new URL('../../../apps/web', import.meta.url)),
  preview: { proxy: { '/api/': { target, changeOrigin: true } } } }
