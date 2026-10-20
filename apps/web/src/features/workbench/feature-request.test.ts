import { afterEach, expect, it, vi } from 'vitest'
import { featureRequestTimeout, requestFeatureJson } from './feature-request'

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })
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
