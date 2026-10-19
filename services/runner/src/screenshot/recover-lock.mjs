import { pathToFileURL } from 'node:url'
import { resolve } from 'node:path'
import { recoverQueueOwner } from './owner.mjs'

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [root, stopped, ...extra] = process.argv.slice(2)
  if (!root || stopped !== '--workers-stopped' || extra.length) {
    console.error('Stop all coordinators and their browser trees, then run: node recover-lock.mjs <private-queue-root> --workers-stopped')
    process.exitCode = 1
  } else {
    try { console.log(JSON.stringify(await recoverQueueOwner(root, { workersStopped: true }))) }
    catch (error) { console.error(error.message); process.exitCode = 1 }
  }
}
