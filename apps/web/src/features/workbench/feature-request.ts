import { requestJson } from '../../api/http'

// A timed-out write has an unknown outcome. Callers retain its idempotency key.
export const featureRequestTimeout = 15_000
export async function requestFeatureJson<T>(path: string, init: RequestInit = {}): Promise<T> {
  const controller = new AbortController()
  const caller = init.signal
  const abort = () => controller.abort()
  if (caller?.aborted) abort()
  else caller?.addEventListener('abort', abort, { once: true })
  const timer = setTimeout(() => controller.abort(), featureRequestTimeout)
  try { return await requestJson<T>(path, { ...init, signal: controller.signal }) }
  finally { clearTimeout(timer); caller?.removeEventListener('abort', abort) }
}
