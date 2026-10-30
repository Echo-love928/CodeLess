// Execute the immutable candidate's own driver. This sidecar only reserves money and retains original state.
import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync, openSync, closeSync, existsSync, lstatSync } from 'node:fs'
import { resolve, join, relative, isAbsolute, sep } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'
import { CnyBatchBudget, PRICE, cnyToNanos } from './cny-budget.mjs'

export const CANDIDATE = 'fb79c402de6b66bc849e87b6880bf955488f8032'
export const IDS = Object.freeze(['SHOW-01', 'SHOW-02', 'SHOW-03', 'TASK-01', 'TASK-02', 'TASK-03', 'CAT-01', 'CAT-02', 'CAT-03',
  'FAULT-CODE-01', 'FAULT-CODE-02', 'FAULT-CODE-03', 'FAULT-ENV-01', 'FAULT-ENV-02'])
export function validateExecutionPlan(plan) {
  assert.equal(plan.candidate, CANDIDATE); assert.deepEqual(plan.samples, IDS)
  assert.equal(plan.model, PRICE.model); assert.equal(plan.mode, 'REAL')
  assert.equal(plan.budget.currency, 'CNY'); assert.equal(plan.budget.maximum, '2')
  assert.equal(plan.budget.scope, 'A_ONLY_14_SAMPLES'); assert.equal(plan.budget.bFuturePaidAuthorized, false)
  assert.equal(plan.handoff, 'ENCRYPTED_TRANSFER_BY_USER_SEPARATE_KEY')
  assert.equal(plan.outerRetries, 0); assert.equal(plan.retainEverySample, true)
  assert.equal(plan.approvalServiceRestored, true, 'Permission-review service must actually recover before execution')
}
export function contained(root, value) {
  const path = resolve(value), tail = relative(resolve(root), path)
  assert.ok(tail && !isAbsolute(tail) && tail !== '..' && !tail.startsWith('..\\') && !tail.startsWith('../'), 'Path outside workspace')
  let current = resolve(root)
  for (const segment of tail.split(sep)) {
    current = join(current, segment)
    try { assert.ok(!lstatSync(current).isSymbolicLink(), 'Linked controller path rejected') }
    catch (error) { if (error.code !== 'ENOENT') throw error }
  }
  return path
}

export async function executeBudgetedBatch(planPath) {
  const root = resolve(fileURLToPath(new URL('../../', import.meta.url)))
  const plan = JSON.parse(readFileSync(contained(root, planPath), 'utf8')); validateExecutionPlan(plan)
  const candidateRoot = contained(root, plan.candidateRoot), outputParent = contained(root, plan.outputParent)
  const privateRoot = contained(root, plan.privateRoot), evidence = contained(root, plan.controllerEvidence)
  const env = { ...process.env }
  assert.ok(env.CODELESS_MODEL_API_KEY && env.CODELESS_MODEL_NAME === PRICE.model, 'Existing fixed model credential/configuration required')
  assert.equal(plan.accountCurrencyVerified, 'CNY', 'Read-only account currency check must complete first')
  const proof = JSON.parse(readFileSync(contained(root, plan.accountProof), 'utf8'))
  assert.equal(proof.httpStatus, 200); assert.equal(proof.balance?.is_available, true)
  assert.equal(proof.credentialDigest, createHash('sha256').update(env.CODELESS_MODEL_API_KEY).digest('hex'))
  const age = Date.now() - Date.parse(proof.at); assert.ok(age >= 0 && age <= 10 * 60000, 'Account proof missing or stale')
  const balance = proof.balance.balance_infos.find(v => v.currency === 'CNY')
  assert.ok(balance && cnyToNanos(balance.total_balance) >= cnyToNanos('2'), 'Authorized CNY cap not funded')
  assert.ok(env.JAVA_HOME, 'Existing locked Java 21 must be set')
  let index = Number(env.GIT_CONFIG_COUNT ?? 0)
  for (const path of [root, candidateRoot]) {
    env['GIT_CONFIG_KEY_' + index] = 'safe.directory'; env['GIT_CONFIG_VALUE_' + index] = path.replaceAll('\\', '/'); index++
  }
  env.GIT_CONFIG_COUNT = String(index); env.CODELESS_EVAL_REAL_APPROVED = '1'
  // The candidate's capture/gitState helpers inherit the orchestrator environment for read-only Git checks.
  for (const [key, value] of Object.entries(env)) if (key.startsWith('GIT_CONFIG_')) process.env[key] = value
  env.CODELESS_EVAL_NETWORK_PREFLIGHT = contained(root, plan.networkPreflight)
  env.NO_PROXY = env.no_proxy = '127.0.0.1,localhost,::1'
  const pk = Object.keys(env).find(k => k.toLowerCase() === 'path') ?? 'PATH'
  env[pk] = join(env.JAVA_HOME, 'bin') + (process.platform === 'win32' ? ';' : ':') + env[pk]
  const git = (...args) => {
    const r = spawnSync('git', args, { cwd: candidateRoot, env, windowsHide: true, encoding: 'utf8' })
    assert.equal(r.status, 0, 'Git validation failed'); return r.stdout.trim()
  }
  assert.equal(git('rev-parse', 'HEAD'), CANDIDATE)
  const driver = await import(pathToFileURL(join(candidateRoot, 'scripts/eval/run-batch.mjs')).href)
  const before = driver.gitState(candidateRoot); assert.equal(before.head, CANDIDATE); assert.equal(before.scopedClean, true)
  const frozen = JSON.parse(readFileSync(join(candidateRoot, 'evals/generation/run-config.json')))
  assert.equal(frozen.runtimeBudget.chargedTokens, 50000); assert.equal(frozen.runtimeBudget.modelRequests, 12)
  assert.equal(frozen.runtimeBudget.outputTokensPerRequest, 4096)
  const expectedFrozen = {
    'requirements.json': 'ef219f3e5c0f05f3ab03ec854c66b32709349f80d1e1aee0076fe19d2b91cb2a',
    'faults.json': '4b147818de5823b2ba3011cc65f57a08f63270154aa01289af8e7631c8790b13',
    'run-config.json': '6dc271c657cdb29e72ec052621fc2633ac5d82b8d8d963bfbffccd0d929cb054',
  }
  for (const [file, digest] of Object.entries(expectedFrozen))
    assert.equal(createHash('sha256').update(readFileSync(join(candidateRoot, 'evals/generation', file))).digest('hex'), digest)
  for (const path of [privateRoot, evidence]) mkdirSync(path, { recursive: true })
  const launchPermit = join(privateRoot, 'one-batch-launch.private.json')
  assert.ok(!existsSync(launchPermit), 'This authorized batch already started; never start another one')
  let consumed = false
  const budget = new CnyBatchBudget('2'), invocations = []
  const save = state => writeFileSync(join(evidence, 'controller-state.json'), JSON.stringify({ candidate: CANDIDATE,
    updatedAt: new Date().toISOString(), state, budget: budget.snapshot(), invocations }, null, 2) + '\n')
  save('STARTING_FIXED_DRIVER')
  const execute = async ({ cwd, env: sampleEnv, log, timeoutMs, sample, outputDir }) => {
    assert.equal(resolve(cwd), candidateRoot); assert.ok(IDS.includes(sample.id))
    const args = ['-B', '-ntp', '-f', 'services/api/pom.xml', '-Dtest=GenerationEvalIT', '-Dsurefire.failIfNoSpecifiedTests=false', 'test']
    const win = process.platform === 'win32', wrapper = win ? 'services\\api\\mvnw.cmd' : './services/api/mvnw'
    const display = [wrapper, ...args]
    if (!budget.begin(sample.id)) {
      invocations.push({ sampleId: sample.id, launched: false, reason: 'CNY_BUDGET_NOT_STARTED' }); save('BUDGET_BLOCKED')
      return { command: display, exitCode: null, signal: null, timedOut: false, launchError: 'CNY_BUDGET_NOT_STARTED', durationMs: 0 }
    }
    // Claim once after the candidate's real preflight, immediately before the first sample JVM.
    // Failed credential-free preflight never consumes the paid batch; a started sample never retries.
    if (!consumed) {
      writeFileSync(launchPermit, JSON.stringify({ at: new Date().toISOString(), candidate: CANDIDATE,
        scope: plan.budget.scope, planPath: relative(root, planPath) }) + '\n', { flag: 'wx', mode: 0o600 })
      consumed = true
    }
    assert.equal(sampleEnv.CODELESS_EVAL_REVISION ?? CANDIDATE, CANDIDATE)
    // Existing immutable harness supports this archival switch. Every original DB/version is exported before teardown.
    sampleEnv.CODELESS_EVAL_RETAIN_ROOT = join(privateRoot, 'retained', sample.id)
    sampleEnv.CODELESS_EVAL_REVISION = CANDIDATE
    const row = { sampleId: sample.id, launched: true, startedAt: new Date().toISOString(), command: display }
    invocations.push(row); save('RUNNING_SAMPLE')
    mkdirSync(resolve(log, '..'), { recursive: true })
    const fd = openSync(log, 'wx'), command = win ? env.ComSpec ?? 'cmd.exe' : wrapper
    const child = spawn(command, win ? ['/d', '/c', wrapper, ...args] : args,
      { cwd, env: sampleEnv, windowsHide: true, stdio: ['ignore', fd, fd] }); closeSync(fd)
    let timedOut = false
    const timer = setTimeout(() => {
      timedOut = true
      if (win && child.pid) spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, timeout: 30000 })
      else child.kill('SIGKILL')
    }, timeoutMs)
    const result = await new Promise(done => {
      child.once('error', e => done({ exitCode: null, signal: null, launchError: e.code }))
      child.once('close', (exitCode, signal) => done({ exitCode, signal, launchError: null }))
    }); clearTimeout(timer)
    const path = join(outputDir, 'record.json')
    let record = null; try { if (existsSync(path)) record = JSON.parse(readFileSync(path, 'utf8')) } catch { /* Missing/invalid stays fully reserved. */ }
    budget.settle(sample.id, record)
    Object.assign(row, result, { timedOut, completedAt: new Date().toISOString(), retained: existsSync(join(sampleEnv.CODELESS_EVAL_RETAIN_ROOT, 'retained.json')) })
    save('SAMPLE_FINISHED')
    return { command: display, ...result, timedOut, durationMs: Date.now() - Date.parse(row.startedAt) }
  }
  try {
    // No replacement preflight/gitState/harness. Candidate's native full preflight and frozen driver execute unchanged.
    const batch = await driver.runBatch({ mode: 'REAL', resume: null, out: outputParent, only: null, isolated: false },
      { env, privateRoot, execute })
    const batchSpec = JSON.parse(readFileSync(join(batch, 'batch.json')))
    assert.equal(batchSpec.git.head, CANDIDATE); assert.deepEqual(batchSpec.samples.map(s => s.id), IDS)
    assert.equal(driver.gitState(candidateRoot).scopedClean, true); assert.equal(git('rev-parse', 'HEAD'), CANDIDATE)
    const allLaunched = invocations.length === 14 && invocations.every(i => i.launched)
    const allRetained = allLaunched && invocations.every(i => i.retained)
    assert.deepEqual(driver.secretOccurrences([privateRoot, batch, evidence], env.CODELESS_MODEL_API_KEY), [], 'Credential bytes in retained outputs; do not publish or package')
    save(allLaunched && allRetained ? 'FINISHED_FULL_BATCH' : 'INCOMPLETE_DO_NOT_CLAIM_ACCEPTANCE')
    writeFileSync(join(evidence, 'batch-reference.json'), JSON.stringify({ batch, candidate: CANDIDATE, allLaunched, allRetained,
      quality: 'PENDING_RECOMPUTATION_AND_B_INDEPENDENT_ACCEPTANCE', budget: budget.snapshot(), paidRunCount: 1 }, null, 2) + '\n', { flag: 'wx' })
    return { batch, allLaunched, allRetained }
  } catch (error) { save('FAILED_OR_INTERRUPTED_RESERVATIONS_RETAINED'); throw error }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  executeBudgetedBatch(process.argv[2]).then(result => { console.log(JSON.stringify(result)); if (!result.allLaunched || !result.allRetained) process.exitCode = 3 })
    .catch(error => { console.error(error.message); process.exitCode = 1 })
}
