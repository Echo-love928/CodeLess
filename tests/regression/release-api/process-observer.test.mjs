import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
const observer = new URL('./followup/process-observer.mjs', import.meta.url).href
test('diagnostic observer preserves spawnSync command/options overload and ordinary argv calls', () => {
  const program = `const cp=require('node:child_process');const a=cp.spawnSync(JSON.stringify(process.execPath)+' -p 42',{shell:true,encoding:'utf8'});const b=cp.spawnSync(process.execPath,['-p','43'],{encoding:'utf8'});console.log(JSON.stringify([a.status,a.stdout.trim(),b.status,b.stdout.trim()]));`
  const plain = spawnSync(process.execPath, ['-e', program], { encoding: 'utf8' })
  const observed = spawnSync(process.execPath, ['--import', observer, '-e', program], { encoding: 'utf8' })
  assert.equal(plain.status, 0, plain.stderr)
  assert.equal(observed.status, plain.status, observed.stderr)
  assert.equal(observed.stdout, plain.stdout)
})
