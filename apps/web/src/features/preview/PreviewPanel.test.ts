import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import PreviewPanel from './PreviewPanel.vue'
import { getPreviewCredential } from './preview-api'
vi.mock('./preview-api', () => ({ getPreviewCredential: vi.fn() }))
// This suite owns credential/frame lifecycle; editor races and requests have their own tests.
vi.mock('../mapping/ComponentEditor.vue', () => ({ default: { template: '<div />' } }))
const get = vi.mocked(getPreviewCredential)
const app = '11111111-1111-4111-8111-111111111111', version = '55555555-5555-4555-8555-555555555555'
const value = (id = version) => ({ applicationId: app, versionId: id,
  url: 'https://v' + id.replaceAll('-', '') + '.preview.codeless-preview.test/__preview/start?credential=test',
  expiresAt: new Date(Date.now() + 120_000).toISOString() })
beforeEach(() => { vi.useFakeTimers(); get.mockReset() })
afterEach(() => { vi.useRealTimers() })
describe('PreviewPanel lifecycle', () => {
  it('has an honest empty/failure state, with no credential request', () => {
    const wrapper = mount(PreviewPanel, { props: { applicationId: app, buildFailed: true } })
    expect(wrapper.text()).toContain('构建失败'); expect(get).not.toHaveBeenCalled(); expect(wrapper.find('iframe').exists()).toBe(false)
    wrapper.unmount()
  })
  it('restricts iframe capabilities, ignores unrelated messages, expires and renews credentials', async () => {
    get.mockResolvedValue(value())
    const wrapper = mount(PreviewPanel, { props: { applicationId: app, versionId: version } })
    await flushPromises()
    expect(wrapper.get('iframe').attributes('sandbox')).toBe('allow-scripts allow-same-origin')
    expect(wrapper.get('iframe').attributes('referrerpolicy')).toBe('no-referrer')
    const source = (wrapper.get('iframe').element as HTMLIFrameElement).contentWindow
    window.dispatchEvent(new MessageEvent('message', { origin: 'https://evil.example', source,
      data: { type: 'codeless-preview', state: 'loaded' } }))
    expect(wrapper.text()).toContain('正在加载')
    window.dispatchEvent(new MessageEvent('message', { origin: new URL(value().url).origin, source,
      data: { type: 'codeless-preview', state: 'loaded' } }))
    await flushPromises()
    expect(wrapper.text()).not.toContain('正在加载')
    await vi.advanceTimersByTimeAsync(120_000)
    expect(wrapper.text()).toContain('已过期'); expect(wrapper.find('iframe').exists()).toBe(false)
    get.mockResolvedValue(value())
    await wrapper.get('button').trigger('click'); await flushPromises()
    expect(get).toHaveBeenCalledTimes(2)
    wrapper.unmount()
  })
  it('does not attach a credential returned for a previous application/version after a switch', async () => {
    let resolveFirst!: (result: ReturnType<typeof value>) => void
    get.mockReturnValueOnce(new Promise(resolve => { resolveFirst = resolve }))
    const wrapper = mount(PreviewPanel, { props: { applicationId: app, versionId: version } })
    const next = '66666666-6666-4666-8666-666666666666'
    get.mockResolvedValueOnce(value(next))
    await wrapper.setProps({ versionId: next }); await flushPromises()
    resolveFirst(value()); await flushPromises()
    expect(wrapper.get('iframe').attributes('src')).toContain(next.replaceAll('-', ''))
    wrapper.unmount()
  })
  it('an error document message cannot be treated as a successful iframe load', async () => {
    get.mockResolvedValue(value())
    const wrapper = mount(PreviewPanel, { props: { applicationId: app, versionId: version } })
    await flushPromises()
    const source = (wrapper.get('iframe').element as HTMLIFrameElement).contentWindow
    window.dispatchEvent(new MessageEvent('message', { origin: new URL(value().url).origin, source,
      data: { type: 'codeless-preview', state: 'unavailable' } }))
    await flushPromises()
    expect(wrapper.get('[role="alert"]').text()).toContain('凭据失效')
    expect(wrapper.find('iframe').exists()).toBe(false)
    wrapper.unmount()
  })
  it('a late refresh error after switching versions cannot remove the new iframe', async () => {
    get.mockResolvedValue(value())
    let rejectRefresh!: (cause: Error) => void
    const callback = () => new Promise<void>((_resolve, reject) => { rejectRefresh = reject })
    const wrapper = mount(PreviewPanel, { props: { applicationId: app, versionId: version, refreshVersion: callback } })
    await flushPromises()
    const source = (wrapper.get('iframe').element as HTMLIFrameElement).contentWindow
    window.dispatchEvent(new MessageEvent('message', { origin: new URL(value().url).origin, source,
      data: { type: 'codeless-preview', state: 'loaded' } }))
    await flushPromises()
    await wrapper.get('button').trigger('click')
    const next = '66666666-6666-4666-8666-666666666666'
    get.mockResolvedValue(value(next))
    await wrapper.setProps({versionId: next}); await flushPromises()
    rejectRefresh(new Error('late network failure')); await flushPromises()
    expect(wrapper.get('iframe').attributes('src')).toContain(next.replaceAll('-', ''))
    expect(wrapper.find('[role="alert"]').exists()).toBe(false)
    wrapper.unmount()
  })
  it('a stalled document remains a visible error rather than readiness', async () => {
    get.mockResolvedValue(value())
    const wrapper = mount(PreviewPanel, { props: { applicationId: app, versionId: version } })
    await flushPromises()
    await vi.advanceTimersByTimeAsync(15_000)
    expect(wrapper.get('[role="alert"]').text()).toContain('时限')
    expect(wrapper.find('iframe').exists()).toBe(false)
    wrapper.unmount()
  })

  it('revokes the old frame immediately while refreshing the current version', async () => {
    get.mockResolvedValue(value())
    let finish!: () => void
    const refreshVersion = () => new Promise<void>(resolve => { finish = resolve })
    const wrapper = mount(PreviewPanel, { props: { applicationId: app, versionId: version, refreshVersion } })
    await flushPromises()
    const source = (wrapper.get('iframe').element as HTMLIFrameElement).contentWindow
    const loaded = () => window.dispatchEvent(new MessageEvent('message', {
      origin: new URL(value().url).origin, source, data: { type: 'codeless-preview', state: 'loaded' },
    }))
    loaded(); await flushPromises()
    await wrapper.get('button').trigger('click')
    // A delayed bridge message from the previous document must not restore editing.
    loaded(); await flushPromises()
    expect(wrapper.find('iframe').exists()).toBe(false)
    expect(wrapper.text()).toContain('正在加载')
    expect(wrapper.get('button').attributes('disabled')).toBeDefined()
    finish(); await flushPromises()
    expect(get).toHaveBeenCalledTimes(2)
    expect(wrapper.find('iframe').exists()).toBe(true)
    wrapper.unmount()
  })

  it('old credential expiry cannot interrupt an in-flight version refresh', async () => {
    get.mockResolvedValue({ ...value(), expiresAt: new Date(Date.now() + 1000).toISOString() })
    let finish!: () => void
    const refreshVersion = () => new Promise<void>(resolve => { finish = resolve })
    const wrapper = mount(PreviewPanel, { props: { applicationId: app, versionId: version, refreshVersion } })
    await flushPromises()
    const source = (wrapper.get('iframe').element as HTMLIFrameElement).contentWindow
    window.dispatchEvent(new MessageEvent('message', { origin: new URL(value().url).origin, source,
      data: { type: 'codeless-preview', state: 'loaded' } }))
    await flushPromises(); await wrapper.get('button').trigger('click')
    await vi.advanceTimersByTimeAsync(1000)
    expect(wrapper.text()).toContain('正在加载')
    expect(wrapper.text()).not.toContain('已过期')
    expect(wrapper.get('button').attributes('disabled')).toBeDefined()
    get.mockResolvedValue(value()); finish(); await flushPromises()
    expect(get).toHaveBeenCalledTimes(2)
    expect(wrapper.find('iframe').exists()).toBe(true)
    wrapper.unmount()
  })

})
