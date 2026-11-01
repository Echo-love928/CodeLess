import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, writeFileSync, mkdirSync, copyFileSync } from 'node:fs'
import { resolve, join, dirname, sep } from 'node:path'
import { spawnSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
const root = resolve(import.meta.dirname, '../../..')
test('real freeze CLI accepts only reviewed checkout EOL forms and rejects content, prompt and historical-byte drift', { timeout: 30000 }, () => {
  const fixture = resolve(root, '.local-data/d26-a/followup/freeze-fixture-' + randomUUID())
  assert.ok(fixture.startsWith(resolve(root, '.local-data/d26-a/followup') + sep))
  const clone = spawnSync('git', ['-c', `safe.directory=${root.replaceAll('\\','/')}`, 'clone', '--shared', '--no-checkout', '--quiet', root, fixture], { encoding: 'utf8' })
  assert.equal(clone.status, 0, clone.stderr)
  const frozen = JSON.parse(readFileSync(join(import.meta.dirname, 'release-freeze.json')))
  const put = (p, bytes) => { const target = resolve(fixture, p); assert.ok(target.startsWith(fixture + sep)); mkdirSync(dirname(target), { recursive: true }); writeFileSync(target, bytes) }
  for (const p of [...Object.keys(frozen.files), ...frozen.failures.map(f => f.source)]) put(p, readFileSync(join(root,p)))
  for (const p of ['freeze.mjs','freeze-bytes.mjs','freeze-source-identities.json','release-freeze.json','restore-runtime-bytes.mjs']) {
    const relative = 'tests/regression/release-api/' + p
    put(relative, readFileSync(join(root, relative)))
  }
  const results = []
  const check = (label, expected, mode = 'check') => {
    const r = spawnSync(process.execPath, ['tests/regression/release-api/freeze.mjs', mode], { cwd: fixture, encoding: 'utf8' })
    results.push({ label, mode, expected, exitCode: r.status, stdout: r.stdout, stderr: r.stderr.slice(0,2500) })
    assert.equal(r.status, expected, `${label}: ${r.stdout}\n${r.stderr}`)
  }
  check('all original bytes',0)
  const reviewed = JSON.parse(readFileSync(join(import.meta.dirname,'freeze-reviewed-eol.json')))
  for (const f of reviewed.files) put(f.path, Buffer.from(readFileSync(join(root,f.path)).toString('utf8').replaceAll('\r\n','\n')))
  check('four known mixed originals checked out as LF',0)
  check('raw legacy mode still reports original hash differences',1,'check-raw')
  for (const f of reviewed.files) put(f.path, Buffer.from(readFileSync(join(root,f.path)).toString('utf8').replaceAll('\r\n','\n').replaceAll('\n','\r\n')))
  check('four known mixed originals checked out as CRLF',0)
  const edited = reviewed.files[2].path
  put(edited, Buffer.concat([readFileSync(join(root,edited)),Buffer.from('changed content')]))
  check('source content mutation',1); put(edited,readFileSync(join(root,edited)))
  const prompt = 'prompts/runtime/generate-v1.txt', bytes = readFileSync(join(root,prompt)), text = bytes.toString('utf8')
  put(prompt,Buffer.from(text.includes('\r\n')?text.replaceAll('\r\n','\n'):text.replaceAll('\n','\r\n')))
  check('runtime prompt EOL mutation',1)
  const restore = spawnSync(process.execPath, ['tests/regression/release-api/restore-runtime-bytes.mjs','--write'], {cwd:fixture,encoding:'utf8'})
  assert.equal(restore.status,0,restore.stderr)
  assert.deepEqual(readFileSync(join(fixture,prompt)),bytes)
  results.push({label:'explicit reviewed prompt EOL restoration',exitCode:restore.status,stdout:restore.stdout})
  check('restored prompt exact raw identity',0)
  put(prompt,Buffer.concat([bytes,Buffer.from('unknown prompt edit')]))
  const reject = spawnSync(process.execPath, ['tests/regression/release-api/restore-runtime-bytes.mjs','--write'], {cwd:fixture,encoding:'utf8'})
  assert.equal(reject.status,1); assert.match(readFileSync(join(fixture,prompt),'utf8'),/unknown prompt edit$/)
  results.push({label:'unknown prompt content refused without overwrite',exitCode:reject.status})
  put(prompt,bytes)
  const historical = frozen.failures[0].source
  put(historical,Buffer.concat([readFileSync(join(root,historical)),Buffer.from('\n')]))
  check('historical failure whitespace mutation',1)
  const evidence = process.env.CODELESS_D26_REVIEW_EVIDENCE_DIR ?? join(root,'.local-data/d26-a/followup/freeze-cli-runs',randomUUID())
  mkdirSync(evidence,{recursive:true})
  const report = join(evidence,'freeze-cli.json')
  writeFileSync(report,JSON.stringify({ fixture, fixtureRetained:true, results },null,2)+'\n')
})
