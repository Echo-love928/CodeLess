import { afterEach, expect, it, vi } from 'vitest'
import { featureRequestTimeout, requestFeatureJson } from './feature-request'

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks() })

it('forwards later caller cancellation without AbortSignal.any and removes its listener', async () => {
  vi.useFakeTimers()
  vi.spyOn(AbortSignal, 'any').mockImplementation(() => { throw new Error('unsupported browser API') })
  const caller = new AbortController()
  const remove = vi.spyOn(caller.signal, 'removeEventListener')
  let signal: AbortSignal | undefined
  vi.stubGlobal('fetch', vi.fn((_path, init: RequestInit) => new Promise((_resolve, reject) => {
    signal = init.signal as AbortSignal
    signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true })
  })))
  const result = expect(requestFeatureJson('/api/v0/tasks/id/diagnostics', { signal: caller.signal })).rejects.toMatchObject({ kind: 'network' })
  expect(signal?.aborted).toBe(false)
  caller.abort()
  await result
  expect(signal?.aborted).toBe(true)
  expect(remove).toHaveBeenCalledWith('abort', expect.any(Function))
  expect(vi.getTimerCount()).toBe(0)
})

it('detaches a live caller after success and deadline failure', async () => {
  vi.useFakeTimers()
  const caller = new AbortController()
  const remove = vi.spyOn(caller.signal, 'removeEventListener')
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ taskId: 'fixture' }) })))
  await requestFeatureJson('/api/v0/tasks/id', { signal: caller.signal })
  expect(remove).toHaveBeenCalledTimes(1)
  vi.stubGlobal('fetch', vi.fn((_path, init: RequestInit) => new Promise((_resolve, reject) => {
    init.signal?.addEventListener('abort', () => reject(new Error('timeout')), { once: true })
  })))
  const result = expect(requestFeatureJson('/api/v0/tasks/id', { signal: caller.signal })).rejects.toMatchObject({ kind: 'network' })
  await vi.advanceTimersByTimeAsync(featureRequestTimeout)
  await result
  expect(remove).toHaveBeenCalledTimes(2)
  expect(caller.signal.aborted).toBe(false)
  expect(vi.getTimerCount()).toBe(0)
})
it('D18-B hanging HTTP settles as a network error and aborts, never as success', async () => {
  vi.useFakeTimers()
  let signal: AbortSignal | undefined
  vi.stubGlobal('fetch', vi.fn((_path, init: RequestInit) => new Promise((_resolve, reject) => {
    signal = init.signal as AbortSignal
    signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true })
  })))
  const result = expect(requestFeatureJson('/api/v0/tasks', { method: 'POST' })).rejects.toMatchObject({ kind: 'network' })
  await vi.advanceTimersByTimeAsync(featureRequestTimeout)
  await result
  expect(signal?.aborted).toBe(true)
  expect(vi.getTimerCount()).toBe(0)
})
it('retains caller cancellation and clears its deadline on success', async () => {
  vi.useFakeTimers()
  const controller = new AbortController()
  vi.stubGlobal('fetch', vi.fn(async (_path, init: RequestInit) => {
    expect(init.signal?.aborted).toBe(true)
    throw new Error('aborted')
  }))
  controller.abort()
  await expect(requestFeatureJson('/api/v0/tasks/id', { signal: controller.signal })).rejects.toMatchObject({ kind: 'network' })
  expect(vi.getTimerCount()).toBe(0)
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ status: 'FAILED' }) })))
  expect(await requestFeatureJson('/api/v0/tasks/id')).toEqual({ status: 'FAILED' })
  expect(vi.getTimerCount()).toBe(0)
})
