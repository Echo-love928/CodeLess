import { requestJson } from '../../api/http'

// A timed-out write has an unknown outcome. Callers retain its idempotency key.
export const featureRequestTimeout = 15_000
export async function requestFeatureJson<T>(path: string, init: RequestInit = {}): Promise<T> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), featureRequestTimeout)
  const signal = init.signal ? AbortSignal.any([init.signal, controller.signal]) : controller.signal
  try { return await requestJson<T>(path, { ...init, signal }) }
  finally { clearTimeout(timer) }
}
