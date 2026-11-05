import { afterEach, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import VisualEditSelector from './VisualEditSelector.vue'
import { createSelectorSession } from './selector-session'

vi.mock('./selector-session', () => ({ createSelectorSession: vi.fn() }))
afterEach(() => vi.resetAllMocks())

it('waits for the preview to load before probing and reconnects after navigation', async () => {
  const probe = vi.fn(), close = vi.fn()
  vi.mocked(createSelectorSession).mockReturnValue({ probe, close, mode: vi.fn(), receive: vi.fn(), clear: vi.fn() })
  const frame = document.createElement('iframe')
  document.body.append(frame)
  const wrapper = mount(VisualEditSelector, { props: { applicationId: 'app', versionId: 'version',
    origin: 'https://preview.example.test', frame, active: false }, global: { stubs: { ComponentEditor: true } } })
  expect(probe).not.toHaveBeenCalled()
  frame.dispatchEvent(new Event('load'))
  expect(probe).not.toHaveBeenCalled()
  await wrapper.setProps({ active: true })
  expect(probe).toHaveBeenCalledTimes(1)
  frame.dispatchEvent(new Event('load'))
  expect(probe).toHaveBeenCalledTimes(2)
  await wrapper.setProps({ active: false })
  expect(close).toHaveBeenCalled()
  wrapper.unmount(); frame.remove()
})
