import { beforeEach, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { computed, ref } from 'vue'
import { ApiError } from '../../api/http'
import { getMapping, selectComponent, createComponentEdit, type Mapping } from '../mapping/component-api'
import VisualComponentEditor from './VisualComponentEditor.vue'
import { editContext, useVisualEditFlow } from './edit-flow'

vi.mock('../mapping/component-api', () => ({ getMapping: vi.fn(), selectComponent: vi.fn(), createComponentEdit: vi.fn() }))
const app = '11111111-1111-4111-8111-111111111111', version = '55555555-5555-4555-8555-555555555555', next = '66666666-6666-4666-8666-666666666666'
const digest = 'sha256:' + 'a'.repeat(64)
const mapping: Mapping = { protocol: 'codeless-component-mapping/v1', versionId: version, sourceDigest: digest,
  components: [{ componentId: 'shared-card', sourceFile: 'src/components/SharedCard.vue', fileDigest: digest, scope: 'SOURCE_FILE' }], disabled: [] }
const selection = { selectable: true as const, shared: true as const, notice: '所有实例', ...mapping.components[0], componentId: 'shared-card', versionId: version, sourceDigest: digest }
const candidate = { versionId: version, sourceDigest: digest, componentId: 'shared-card' }
const accept = vi.fn(), posting = ref(false)
function mountEditor() {
  return mount(VisualComponentEditor, { props: { applicationId: app, versionId: version, candidate },
    global: { provide: { [editContext as symbol]: { locked: computed(() => posting.value), begin: () => { posting.value = true; return () => { posting.value = false } }, accept } } } })
}
beforeEach(() => { vi.resetAllMocks(); posting.value = false; vi.mocked(getMapping).mockResolvedValue(mapping); vi.mocked(selectComponent).mockResolvedValue(selection) })
it('resolves an early candidate when mapping arrives, and resets confirmation on a different selection', async () => {
  let resolve!: (value: Mapping) => void
  vi.mocked(getMapping).mockReturnValue(new Promise(done => { resolve = done }))
  const wrapper = mountEditor(); expect(wrapper.find('textarea').exists()).toBe(false)
  resolve(mapping); await flushPromises()
  await wrapper.get('textarea').setValue('描述'); expect(wrapper.get('button').attributes('disabled')).toBeDefined()
  await wrapper.get('input').setValue(true); expect(wrapper.get('button').attributes('disabled')).toBeUndefined()
  await wrapper.setProps({ candidate: { ...candidate } }); await flushPromises()
  expect((wrapper.get('input').element as HTMLInputElement).checked).toBe(false)
  wrapper.unmount()
})
it('retains composition and the same idempotency key after an ambiguous network failure, without auto retry', async () => {
  vi.mocked(createComponentEdit).mockRejectedValue(new ApiError('network'))
  const wrapper = mountEditor(); await flushPromises()
  await wrapper.get('textarea').setValue('保留这段需求'); await wrapper.get('input').setValue(true)
  await wrapper.get('button').trigger('click'); await flushPromises()
  expect(createComponentEdit).toHaveBeenCalledTimes(1); expect(accept).not.toHaveBeenCalled()
  expect((wrapper.get('textarea').element as HTMLTextAreaElement).value).toBe('保留这段需求')
  await wrapper.get('button').trigger('click'); await flushPromises()
  expect(vi.mocked(createComponentEdit).mock.calls[1][3]).toBe(vi.mocked(createComponentEdit).mock.calls[0][3])
  wrapper.unmount()
})
it('does not attach an accepted response returned after a version/application change', async () => {
  let resolve!: (value: Awaited<ReturnType<typeof createComponentEdit>>) => void
  vi.mocked(createComponentEdit).mockReturnValue(new Promise(done => { resolve = done }))
  const flow = useVisualEditFlow(() => app, vi.fn(), vi.fn())
  const wrapper = mount(VisualComponentEditor, { props: { applicationId: app, versionId: version, candidate },
    global: { provide: { [editContext as symbol]: flow } } })
  await flushPromises(); await wrapper.get('textarea').setValue('修改'); await wrapper.get('input').setValue(true)
  await wrapper.get('button').trigger('click')
  flow.reset(); await wrapper.setProps({ versionId: next, candidate: null })
  resolve({ task: { id: app }, baseVersionId: version }); await flushPromises()
  expect(flow.accepted.value).toBeUndefined(); expect(wrapper.emitted('accepted')).toBeUndefined()
  wrapper.unmount(); flow.reset()
})
