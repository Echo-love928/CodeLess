import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../../api/http'
import taskFixture from '../../../../../contracts/examples/v0/valid/task.json'
import { useWorkbenchTask } from './use-workbench-task'
import { cancelTask, createTask, getTask } from './task-api'
import { connectTaskEvents } from '../../lib/events/task-events'

vi.mock('./task-api', async importOriginal => ({ ...await importOriginal<typeof import('./task-api')>(), getTask: vi.fn(), createTask: vi.fn(), cancelTask: vi.fn() }))
vi.mock('../../lib/events/task-events', () => ({ connectTaskEvents: vi.fn(() => vi.fn()) }))
const running = { ...taskFixture, status: 'GENERATE', failureCode: null }
beforeEach(() => { vi.clearAllMocks(); localStorage.clear() })

describe('workbench action and lifecycle constraints', () => {
  it('failed cancellation keeps the active task; pending cancellation cannot retry', async () => {
    const state = useWorkbenchTask(async () => false)
    vi.mocked(createTask).mockResolvedValue(running)
    await state.restore(running.applicationId, 'owner')
    await state.start('Build a page')
    let reject!: (error: Error) => void
    vi.mocked(cancelTask).mockReturnValue(new Promise((_, fail) => { reject = fail }))
    const cancelling = state.cancel()
    expect(state.cancelling.value).toBe(true)
    expect(state.canStart.value).toBe(false)
    expect(state.task.value?.failureCode).toBeNull()
    await state.start('Another page')
    expect(createTask).toHaveBeenCalledTimes(1)
    reject(new ApiError('network'))
    await cancelling
    expect(state.task.value?.status).toBe('GENERATE')
    expect(state.error.value).toContain('网络连接失败')
    state.dispose()
  })

  it('ambiguous create retry reuses an idempotency key; accepted task blocks double submission', async () => {
    const state = useWorkbenchTask(async () => false)
    await state.restore(running.applicationId, 'owner')
    vi.mocked(createTask).mockRejectedValueOnce(new ApiError('network')).mockResolvedValueOnce(running)
    await state.start('Build a page')
    await state.start('Build a page')
    expect(vi.mocked(createTask).mock.calls[0][2]).toBe(vi.mocked(createTask).mock.calls[1][2])
    await state.start('Build a page')
    expect(createTask).toHaveBeenCalledTimes(2)
    expect(localStorage.getItem(`codeless:task:v1:owner:${running.applicationId}`)).toBe(running.id)
    state.dispose()
  })

  it('old GET completion cannot overwrite a confirmed cancellation response', async () => {
    const state = useWorkbenchTask(async () => false)
    await state.restore(running.applicationId, 'owner')
    vi.mocked(createTask).mockResolvedValue(running)
    await state.start('Build a page')
    const stream = vi.mocked(connectTaskEvents).mock.calls[0][0]
    vi.mocked(cancelTask).mockResolvedValue({ ...running, status: 'FAILED', failureCode: 'CANCELLED' })
    await state.cancel()
    stream.onTask(running)
    expect(state.task.value?.status).toBe('FAILED')
    expect(state.task.value?.failureCode).toBe('CANCELLED')
    state.dispose()
  })

  it('unknown status disables cancel and create; disposed stream callbacks cannot update another app', async () => {
    const state = useWorkbenchTask(async () => false)
    vi.mocked(getTask).mockResolvedValue({ ...running, status: 'FUTURE_STATUS' })
    await state.restore(running.applicationId, 'owner', running.id)
    expect(state.canCancel.value).toBe(false)
    expect(state.canStart.value).toBe(false)
    const stream = vi.mocked(connectTaskEvents).mock.calls[0][0]
    await state.restore('33333333-3333-4333-8333-333333333333', 'owner')
    stream.onTask(running)
    stream.onEvents([{ id: 'old' } as never])
    expect(state.task.value).toBeNull()
    expect(state.events.value).toEqual([])
    state.dispose()
  })

  it.each([
    ['FAILED', 'CANCELLED'], ['FAILED', 'BUILD_FAILED'], ['READY', null],
  ])('delayed refresh cannot regress confirmed %s/%s, even with equal timestamps', async (status, failureCode) => {
    const state = useWorkbenchTask(async () => false)
    await state.restore(running.applicationId, 'owner')
    vi.mocked(createTask).mockResolvedValue(running)
    await state.start('Build a page')
    const stream = vi.mocked(connectTaskEvents).mock.calls[0][0]
    let resolve!: (value: typeof running) => void
    vi.mocked(getTask).mockReturnValue(new Promise(accept => { resolve = accept }))
    const refreshing = state.refresh()
    stream.onTask({ ...running, status, failureCode })
    expect(state.task.value?.status).toBe(status)
    resolve(running)
    await refreshing
    expect(state.task.value?.status).toBe(status)
    expect(state.task.value?.failureCode).toBe(failureCode)
    expect(state.canCancel.value).toBe(false)
    expect(state.canStart.value).toBe(true)
    state.dispose()
  })

  it('delayed refresh cannot replace a newer running snapshot', async () => {
    const state = useWorkbenchTask(async () => false)
    await state.restore(running.applicationId, 'owner')
    vi.mocked(createTask).mockResolvedValue(running)
    await state.start('Build a page')
    const stream = vi.mocked(connectTaskEvents).mock.calls[0][0]
    let resolve!: (value: typeof running) => void
    vi.mocked(getTask).mockReturnValue(new Promise(accept => { resolve = accept }))
    const refreshing = state.refresh()
    stream.onTask({ ...running, status: 'VERIFY', updatedAt: '2026-09-26T12:11:00Z' })
    resolve(running)
    await refreshing
    expect(state.task.value?.status).toBe('VERIFY')
    expect(state.task.value?.updatedAt).toBe('2026-09-26T12:11:00Z')
    state.dispose()
  })

  it('retry switches task identity and history; callbacks from the old subscription are ignored', async () => {
    const onError = vi.fn(async () => false)
    const state = useWorkbenchTask(onError)
    await state.restore(running.applicationId, 'owner')
    vi.mocked(createTask).mockResolvedValueOnce(running)
    await state.start('Build a page')
    const old = vi.mocked(connectTaskEvents).mock.calls[0][0]
    old.onTask({ ...running, status: 'FAILED', failureCode: 'CANCELLED' })
    old.onEvents([{ id: 'old' } as never])
    const next = { ...running, id: '44444444-4444-4444-8444-444444444444', status: 'PLAN' }
    vi.mocked(createTask).mockResolvedValueOnce(next)
    await state.start('Build a page')
    expect(state.task.value?.id).toBe(next.id)
    expect(state.events.value).toEqual([])
    const current = vi.mocked(connectTaskEvents).mock.calls[1][0]
    current.onEvents([{ id: 'new' } as never])
    current.onConnection('connected')
    old.onTask({ ...running, status: 'FAILED', failureCode: 'CANCELLED' })
    old.onEvents([{ id: 'late-old' } as never])
    old.onConnection('blocked', 'old connection')
    old.onError(new ApiError('unauthorized', 401))
    expect(state.task.value).toEqual(next)
    expect(state.events.value).toEqual([{ id: 'new' }])
    expect(state.connection.value).toBe('connected')
    expect(onError).not.toHaveBeenCalled()
    expect(localStorage.getItem(`codeless:task:v1:owner:${running.applicationId}`)).toBe(next.id)
    expect(current.taskId).toBe(next.id)
    state.dispose()
  })
})
