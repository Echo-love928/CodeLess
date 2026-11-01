import { afterEach, expect, it, vi } from 'vitest'
import { requestJson } from './http'

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks() })
it.each([[401, 'unauthorized'], [403, 'forbidden'], [429, 'rate-limited'], [503, 'server']] as const)(
  'releases the unused %s response stream and preserves its HTTP error', async (status, kind) => {
    const response = new Response('{"message":"rejected"}', { status })
    const cancel = vi.spyOn(response.body!, 'cancel')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response))
    await expect(requestJson('/api/v0/auth/me')).rejects.toMatchObject({ kind, status })
    expect(cancel).toHaveBeenCalledOnce()
  },
)
it('preserves the original unauthorized error if stream cancellation fails', async () => {
  const response = new Response('{}', { status: 401 })
  const cancel = vi.spyOn(response.body!, 'cancel').mockRejectedValue(new Error('transport closed'))
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response))
  await expect(requestJson('/api/v0/auth/me')).rejects.toMatchObject({ kind: 'unauthorized', status: 401 })
  expect(cancel).toHaveBeenCalledOnce()
})
it('keeps the successful JSON response available to its caller', async () => {
  const response = new Response('{"ok":true}')
  const cancel = vi.spyOn(response.body!, 'cancel')
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response))
  await expect(requestJson('/api/v0/example')).resolves.toEqual({ ok: true })
  expect(cancel).not.toHaveBeenCalled()
})
