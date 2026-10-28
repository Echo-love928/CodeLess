import assert from 'node:assert/strict'

// Independent audit of raw observations; process success alone is insufficient.
export function validateInterference(report) {
  assert.equal(report.status, 'PASSED')
  const memory = report.faults.find(f => f.mode === 'memory')
  const control = report.faults.find(f => f.mode === 'memory-control')
  const cpu = report.faults.find(f => f.mode === 'timeout')
  const observed = memory?.observed?.value, controlObserved = control?.observed?.value
  assert.equal(observed?.barrier?.kind, 'RUNNING_OOMKILLED_AND_CGROUP_OOM_KILL', 'independent OOM barrier required')
  assert.equal(observed.barrier.state.Running, true); assert.equal(observed.barrier.state.OOMKilled, true)
  assert.match(observed.barrier.events, /^oom_kill [1-9]\d*$/m)
  assert.equal(Number(observed.barrier.memoryMax.trim()), 96 * 1024 * 1024)
  assert.ok(observed.release.monotonicMs < observed.barrier.monotonicMs)
  assert.equal(observed.afterQueries.Running, true); assert.equal(observed.afterQueries.OOMKilled, true)
  const oomSamples = report.samples.filter(s => s.phase === 'memory-after-oom-confirmation')
  assert.equal(oomSamples.length, 10)
  for (const s of oomSamples) assert.ok(s.monotonicStartMs >= observed.barrier.monotonicMs, 'GET must follow actual OOM observation')
  const controls = report.samples.filter(s => s.phase === 'memory-control-before-pressure-release')
  assert.equal(controls.length, 10); assert.equal(controlObserved.controlOnly, true)
  for (const s of controls) assert.ok(s.monotonicEndMs < controlObserved.release.monotonicMs, 'negative control is explicitly pre-pressure')
  assert.ok(controlObserved.release.monotonicMs < controlObserved.barrier.monotonicMs)
  assert.equal(cpu.observed.value.barrier.kind, 'CPU_USAGE_AND_LOOP_CHILD')
  const cpuBarrier = cpu.observed.value.barrier
  assert.match(cpuBarrier.top, /node\s+-e\s+while\(true\)/)
  const usage = text => Number(text.match(/^usage_usec (\d+)$/m)?.[1])
  assert.ok(usage(cpuBarrier.after) - usage(cpuBarrier.before) > 100000)
  if (cpuBarrier.startupObservations) {
    assert.ok(cpuBarrier.startupObservations.length > 0)
    assert.equal(cpuBarrier.startupObservations.at(-1).top, cpuBarrier.top)
    for (const observation of cpuBarrier.startupObservations) assert.ok(observation.monotonicMs <= cpuBarrier.monotonicMs)
  }
  assert.equal(cpu.observed.value.afterQueries.Running, true)
  const cpuSamples = report.samples.filter(s => s.phase === 'timeout-after-cpu-barrier')
  assert.equal(cpuSamples.length, 10)
  for (const s of cpuSamples) assert.ok(s.monotonicStartMs >= cpu.observed.value.barrier.monotonicMs)
  for (const fault of report.faults) {
    assert.deepEqual(fault.result.cleanup, { containerRemoved: true, workspaceRemoved: true, errors: [] })
    const after = report.samples.filter(s => s.phase === fault.mode + '-after-cleanup')
    assert.equal(after.length, 10)
    for (const s of after) assert.ok(Date.parse(s.startedAt) >= Date.parse(fault.result.completedAt))
  }
  assert.ok(report.samples.every(s => s.status === 200 && s.monotonicEndMs >= s.monotonicStartMs))
  return { qualifiedOOM: 10, qualifiedCPU: 10, negativeControl: 10, total: report.samples.length }
}
