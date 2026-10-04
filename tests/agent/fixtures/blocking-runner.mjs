import { spawn } from 'node:child_process'
import { readFileSync, writeFileSync, renameSync } from 'node:fs'
import { join } from 'node:path'

// Process-lifecycle fixture only. Its JSON is never accepted as real build evidence.
const work = process.argv[2]
const mode = readFileSync(join(work, 'mode.txt'), 'utf8')
process.stdin.resume()
if (mode === 'normal') {
  process.stdin.on('end', () => { process.stdout.write('{"status":"VERIFIED"}'); process.exitCode = 0 })
} else {
  const descendant = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'],
    { stdio: ['ignore', 'inherit', 'inherit'], windowsHide: true })
  writeFileSync(join(work, 'started.tmp'), JSON.stringify({ parent: process.pid, descendant: descendant.pid }))
  renameSync(join(work, 'started.tmp'), join(work, 'started.json'))
  process.stderr.write('explicit blocking transport fixture\n')
  setInterval(() => {}, 1000)
}
