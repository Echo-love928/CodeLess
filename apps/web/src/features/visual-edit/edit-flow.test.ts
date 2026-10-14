import { afterEach, expect, it, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { connectTaskEvents } from '../../lib/events/task-events'
import { getTask, cancelTask, type GenerationTask } from '../workbench/task-api'
import { getTaskDiagnostics, type TaskDiagnostics } from '../workbench/task-diagnostics'
import { getVersion, type Version } from '../versions/version-api'
import { useVisualEditFlow, validateAccepted } from './edit-flow'

vi.mock('../../lib/events/task-events', () => ({ connectTaskEvents: vi.fn(() => vi.fn()) }))
vi.mock('../workbench/task-api', async original => ({ ...await original<typeof import('../workbench/task-api')>(), getTask: vi.fn(), cancelTask: vi.fn() }))
vi.mock('../workbench/task-diagnostics', () => ({ getTaskDiagnostics: vi.fn() }))
vi.mock('../versions/version-api', () => ({ getVersion: vi.fn() }))
const app = '11111111-1111-4111-8111-111111111111', base = '22222222-2222-4222-8222-222222222222'
const taskId = '33333333-3333-4333-8333-333333333333', next = '44444444-4444-4444-8444-444444444444', buildId = '55555555-5555-4555-8555-555555555555'
const task = (status = 'READY'): GenerationTask => ({ id: taskId, applicationId: app, status, prompt: '修改颜色', repairAttempts: 0, createdAt: '2026-10-14T00:00:00Z', updatedAt: '2026-10-14T00:01:00Z' })
const version: Version = { id: next, applicationId: app, taskId, buildId, sourceDigest: 'sha256:' + 'a'.repeat(64), number: 2, status: 'VERIFIED', createdAt: '2026-10-14T00:01:00Z' }
const detail: TaskDiagnostics = { taskId, files: { available: false, revision: 0, changes: [] }, builds: [{ id: buildId, versionId: next, status: 'SUCCEEDED', exitCode: 0, artifactDigest: 'sha256:' + 'a'.repeat(64), createdAt: version.createdAt, completedAt: version.createdAt }] }
function setup() {
  vi.mocked(getTaskDiagnostics).mockResolvedValue(detail); vi.mocked(getVersion).mockResolvedValue(version)
  const adopt = vi.fn(), flow = useVisualEditFlow(() => app, adopt, vi.fn())
  flow.accept({ task: { id: taskId }, baseVersionId: base }, '修改颜色', 'shared-card')
  const stream = vi.mocked(connectTaskEvents).mock.calls.at(-1)![0]
  return { flow, adopt, stream }
}
afterEach(() => vi.resetAllMocks())
it('a released old submission cannot unlock a new application submission', () => {
  const flow = useVisualEditFlow(() => app, vi.fn(), vi.fn())
  const oldRelease = flow.begin()!
  expect(flow.locked.value).toBe(true); expect(flow.begin()).toBeUndefined()
  flow.reset()
  const newRelease = flow.begin()!
  oldRelease(); expect(flow.locked.value).toBe(true)
  newRelease(); expect(flow.locked.value).toBe(false)
  const thirdRelease = flow.begin()!
  newRelease(); expect(flow.locked.value).toBe(true)
  thirdRelease(); flow.reset()
})
it('adopts only the exact immutable version bound to the READY task and successful build', async () => {
  const { flow, adopt, stream } = setup()
  stream.onTask(task('VERIFY')); await flushPromises()
  expect(flow.locked.value).toBe(true); expect(adopt).not.toHaveBeenCalled()
  stream.onTask(task()); await flushPromises()
  expect(adopt).toHaveBeenCalledWith(version); expect(flow.locked.value).toBe(false)
  flow.reset()
})
it.each([
  { taskId: base }, { buildId: base }, { status: 'DRAFT' }, { id: base },
])('preserves the old preview when version provenance/state is mismatched: %j', async patch => {
  const { flow, adopt, stream } = setup()
  vi.mocked(getVersion).mockResolvedValue({ ...version, ...patch } as Version)
  stream.onTask(task()); await flushPromises()
  expect(adopt).not.toHaveBeenCalled(); expect(flow.result.value).toBeUndefined()
  expect(flow.error.value).toContain('确切'); expect(flow.locked.value).toBe(true)
  flow.reset()
})
it('does not interpret unknown task state or a missing build as success', async () => {
  const { flow, adopt, stream } = setup()
  stream.onTask(task('FUTURE')); await flushPromises(); expect(adopt).not.toHaveBeenCalled()
  vi.mocked(getTaskDiagnostics).mockResolvedValue({ ...detail, builds: [] })
  stream.onTask(task()); await flushPromises(); expect(adopt).not.toHaveBeenCalled()
  expect(flow.locked.value).toBe(true); flow.reset()
})
it('keeps failure logs and enables another edit without adopting the failed candidate', async () => {
  const { flow, adopt, stream } = setup()
  stream.onEvents([{ id: buildId, taskId, sequence: 1, type: 'TASK_FAILED', stage: 'FAILED', message: '<script>失败日志</script>', occurredAt: version.createdAt }])
  stream.onTask({ ...task('FAILED'), failureCode: 'BUILD_FAILED' }); await flushPromises()
  expect(flow.locked.value).toBe(false); expect(adopt).not.toHaveBeenCalled()
  expect(flow.events.value[0].message).toContain('<script>'); expect(flow.description.value).toBe('修改颜色')
  flow.reset()
})
it('rejects late callbacks and diagnostics after switching application or disposing', async () => {
  const { flow, adopt, stream } = setup()
  let resolve!: (value: TaskDiagnostics) => void
  vi.mocked(getTaskDiagnostics).mockReturnValue(new Promise(done => { resolve = done }))
  stream.onTask(task()); flow.reset(); resolve(detail); stream.onTask(task('FAILED')); await flushPromises()
  expect(adopt).not.toHaveBeenCalled(); expect(flow.task.value).toBeNull(); expect(flow.events.value).toEqual([])
})
it('allows explicit refresh after missing evidence, and cancellation retains the base', async () => {
  const { flow, adopt, stream } = setup()
  vi.mocked(getTaskDiagnostics).mockRejectedValueOnce(new Error('unavailable'))
  stream.onTask(task()); await flushPromises(); expect(adopt).not.toHaveBeenCalled()
  vi.mocked(getTask).mockResolvedValue(task())
  await flow.refresh(); expect(adopt).toHaveBeenCalledWith(version)
  flow.reset(); flow.accept({ task: { id: taskId }, baseVersionId: base }, '修改', 'shared-card')
  vi.mocked(connectTaskEvents).mock.calls.at(-1)![0].onTask(task('VERIFY')); await flushPromises()
  vi.mocked(cancelTask).mockResolvedValue({ ...task('FAILED'), failureCode: 'CANCELLED' })
  await flow.cancel(); expect(flow.task.value?.failureCode).toBe('CANCELLED'); expect(flow.result.value).toBeUndefined()
  flow.reset()
})
it('validates acknowledgement identity before starting a subscription', () => {
  expect(() => validateAccepted({ task: { id: 'bad' }, baseVersionId: base }, base)).toThrow()
  expect(() => validateAccepted({ task: { id: taskId }, baseVersionId: next }, base)).toThrow()
})
