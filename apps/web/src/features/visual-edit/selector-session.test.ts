import { describe, expect, it, vi } from 'vitest'
import { createSelectorSession } from './selector-session'

const versionId = '55555555-5555-4555-8555-555555555555'
const sourceDigest = 'sha256:' + 'a'.repeat(64), origin = 'https://preview.example'
const protocol = 'codeless-selector/v1'
const challenge = '11111111-1111-4111-8111-111111111111'
function fixture() {
  const frame = { postMessage: vi.fn() } as unknown as Window
  const onSelection = vi.fn(), onExit = vi.fn(), onReady = vi.fn()
  const session = createSelectorSession({ frame, origin, versionId, onSelection, onExit, onReady })
  const receive = (data: object, overrides = {}) => session.receive({ source: frame, origin, data, ...overrides } as MessageEvent)
  receive({ protocol, type: 'ready', versionId, sourceDigest, challenge })
  const init = vi.mocked(frame.postMessage).mock.calls[0]![0]
  const base = { protocol, versionId, sourceDigest, nonce: init.nonce }
  receive({ ...base, type: 'ack' }); session.mode(true); onSelection.mockClear()
  const selection = { ...base, type: 'selection', componentId: 'shared-card', instance: { index: 2, count: 3 } }
  return { session, frame, receive, selection, onSelection, onExit, onReady }
}
describe('closed selector session', () => {
  it('projects instance data to the sidebar and keeps API candidate path-free', () => {
    const f = fixture(); f.receive(f.selection)
    expect(f.onReady).toHaveBeenCalledOnce()
    expect(f.onSelection).toHaveBeenCalledWith({ candidate: { versionId, sourceDigest, componentId: 'shared-card' }, instance: { index: 2, count: 3 } })
    expect(vi.mocked(f.frame.postMessage).mock.calls.every(call => (call[1] as unknown) === origin)).toBe(true)
  })
  it('rejects wrong origin/source, nonce/version/digest, extra paths and invalid instance/schema', () => {
    const f = fixture()
    f.receive(f.selection, { origin: origin + '.evil' }); f.receive(f.selection, { source: window })
    for (const patch of [{ nonce: challenge }, { versionId: challenge }, { sourceDigest: 'sha256:' + 'b'.repeat(64) },
      { sourceFile: 'src/pages/HomePage.vue' }, { componentId: 'shared-card\n' }, { instance: { index: 0, count: 3 } },
      { instance: { index: 4, count: 3 } }, { instance: { index: 1, count: 10001 } }, { instance: { index: 1, count: 3, path: 'x' } }, { instance: null }, { protocol: 'v0' }])
      f.receive({ ...f.selection, ...patch })
    f.session.receive({ source: f.frame, origin, data: [] } as unknown as MessageEvent)
    expect(f.onSelection).not.toHaveBeenCalled()
    f.receive(f.selection); expect(f.onSelection).toHaveBeenCalledOnce()
  })
  it('ignores late selections after exit, disabling and disposal', () => {
    const f = fixture(); f.receive({ ...f.selection, type: 'exit', componentId: undefined })
    expect(f.onExit).not.toHaveBeenCalled() // Extra fields are still invalid.
    const { componentId: _id, instance: _instance, ...base } = f.selection
    void _id; void _instance
    f.receive({ ...base, type: 'exit' }); expect(f.onExit).toHaveBeenCalledOnce()
    f.onSelection.mockClear(); f.receive(f.selection); expect(f.onSelection).not.toHaveBeenCalled()
    f.session.mode(true); f.session.close(); f.onSelection.mockClear()
    f.receive(f.selection); expect(f.onSelection).not.toHaveBeenCalled()
  })
})
