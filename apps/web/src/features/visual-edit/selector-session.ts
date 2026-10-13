import type { Candidate } from '../mapping/component-api'

export interface Instance { index: number; count: number }
export interface Selected { candidate: Candidate; instance: Instance | null }
const protocol = 'codeless-selector/v1'
const exact = (data: Record<string, unknown>, keys: string[]) => Object.keys(data).length === keys.length && keys.every(key => Object.hasOwn(data, key))
const uuid = (value: unknown): value is string => typeof value === 'string' && value.length === 36 && /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/.test(value)
const digest = (value: unknown): value is string => typeof value === 'string' && value.length === 71 && /^sha256:[a-f0-9]{64}$/.test(value)
const id = (value: unknown) => typeof value === 'string' && value.length <= 64 && /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(value)

export function createSelectorSession(options: {
  frame: Window; origin: string; versionId: string
  onSelection: (value: Selected | null) => void; onExit: () => void; onReady: () => void
}) {
  const nonce = crypto.randomUUID()
  let sourceDigest: string | undefined, challenge: string | undefined, connected = false, closed = false, enabled = false
  const send = (type: string, extra = {}) => options.frame.postMessage({ protocol, type, versionId: options.versionId, sourceDigest, nonce, ...extra }, options.origin)
  return {
    probe() { options.frame.postMessage({ protocol, type: 'probe', versionId: options.versionId }, options.origin) },
    receive(event: MessageEvent) {
      if (closed || event.source !== options.frame || event.origin !== options.origin || !event.data || typeof event.data !== 'object' || Array.isArray(event.data)) return
      const data = event.data as Record<string, unknown>
      if (data.protocol !== protocol || data.versionId !== options.versionId) return
      if (data.type === 'ready') {
        if (challenge || !exact(data, ['protocol', 'type', 'versionId', 'sourceDigest', 'challenge']) || !uuid(data.challenge) || !digest(data.sourceDigest)) return
        challenge = data.challenge; sourceDigest = data.sourceDigest
        send('init', { challenge }); return
      }
      if (!sourceDigest || data.sourceDigest !== sourceDigest || data.nonce !== nonce) return
      const base = ['protocol', 'type', 'versionId', 'sourceDigest', 'nonce']
      if (data.type === 'ack' && exact(data, base) && !connected) { connected = true; options.onReady(); return }
      if (!connected || !enabled) return
      if (data.type === 'exit' && exact(data, base)) { enabled = false; options.onSelection(null); options.onExit(); return }
      if (data.type !== 'selection' || !exact(data, [...base, 'componentId', 'instance'])) return
      if (data.componentId === null && data.instance === null) { options.onSelection(null); return }
      if (!id(data.componentId) || !data.instance || typeof data.instance !== 'object' || Array.isArray(data.instance)) return
      const instance = data.instance as Record<string, unknown>
      if (!exact(instance, ['index', 'count']) || !Number.isInteger(instance.index) || !Number.isInteger(instance.count) ||
          (instance.index as number) < 1 || (instance.count as number) < (instance.index as number) || (instance.count as number) > 10000) return
      options.onSelection({ candidate: { componentId: data.componentId as string, versionId: options.versionId, sourceDigest }, instance: instance as unknown as Instance })
    },
    mode(value: boolean) { enabled = connected && value; options.onSelection(null); if (connected) send('mode', { enabled }) },
    clear() { options.onSelection(null); if (connected) send('clear') },
    close() { if (connected) send('mode', { enabled: false }); closed = true; connected = false; enabled = false; options.onSelection(null) },
  }
}
