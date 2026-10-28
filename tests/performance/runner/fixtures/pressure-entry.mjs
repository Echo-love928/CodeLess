// Trusted test image only. The real D07 cgroup victim/guardian is unchanged.
import { existsSync, readdirSync, writeFileSync, renameSync } from 'node:fs'
import { setTimeout as sleep } from 'node:timers/promises'
if (readdirSync('/input/src/data').includes('Memory.ts')) {
  writeFileSync('/output/armed.tmp', JSON.stringify({ armed: true, pressureReleased: false }))
  renameSync('/output/armed.tmp', '/output/armed.json')
  const end = Date.now() + 7000
  while (!existsSync('/output/release-pressure')) {
    if (Date.now() >= end) throw new Error('test host did not release memory pressure')
    await sleep(10)
  }
  // Explicit delayed-allocation regression: Running by itself cannot prove pressure.
  await sleep(500)
}
await import('./fault-entry.mjs')
