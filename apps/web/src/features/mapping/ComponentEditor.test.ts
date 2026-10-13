import { flushPromises, mount } from '@vue/test-utils'
import { expect, it, vi, beforeEach } from 'vitest'
import ComponentEditor from './ComponentEditor.vue'
import { getMapping, selectComponent, createComponentEdit, type Mapping } from './component-api'
import { ApiError } from '../../api/http'
vi.mock('./component-api', () => ({ getMapping: vi.fn(), selectComponent: vi.fn(), createComponentEdit: vi.fn() }))
const push = vi.hoisted(() => vi.fn())
vi.mock('vue-router', () => ({ useRouter: () => ({ push }) }))
const app = '11111111-1111-4111-8111-111111111111', version = '55555555-5555-4555-8555-555555555555'
const digest = 'sha256:' + 'a'.repeat(64)
const mapping: Mapping = { protocol: 'codeless-component-mapping/v1', versionId: version, sourceDigest: digest, components: [{ componentId: 'shared-card', sourceFile: 'src/components/SharedCard.vue', fileDigest: digest, scope: 'SOURCE_FILE' }], disabled: [] }
beforeEach(() => { vi.clearAllMocks(); vi.mocked(getMapping).mockResolvedValue(mapping) })
it('a late selection cannot survive switching the immutable version', async () => {
  let resolveOld!: (value: Awaited<ReturnType<typeof selectComponent>>) => void
  vi.mocked(selectComponent).mockReturnValue(new Promise(resolve => { resolveOld = resolve }))
  const wrapper = mount(ComponentEditor, { props: { applicationId: app, versionId: version } })
  await flushPromises()
  await wrapper.setProps({ candidate: { versionId: version, sourceDigest: digest, componentId: 'shared-card' } })
  await wrapper.setProps({ versionId: app })
  resolveOld({ selectable: true, shared: true, notice: '全部实例', ...mapping.components[0]!, versionId: version, sourceDigest: digest })
  await flushPromises()
  expect(wrapper.find('textarea').exists()).toBe(false)
  wrapper.unmount()
})
it('a stale-base conflict keeps the description and never automatically retries or navigates', async () => {
  vi.mocked(selectComponent).mockResolvedValue({ selectable: true, shared: true, notice: '全部实例', ...mapping.components[0]!, versionId: version, sourceDigest: digest })
  vi.mocked(createComponentEdit).mockRejectedValue(new ApiError('server', 409))
  const wrapper = mount(ComponentEditor, { props: { applicationId: app, versionId: version } })
  await flushPromises(); await wrapper.setProps({ candidate: { versionId: version, sourceDigest: digest, componentId: 'shared-card' } }); await flushPromises()
  await wrapper.get('textarea').setValue('保留这段修改描述')
  await wrapper.get('button').trigger('click'); await flushPromises()
  expect((wrapper.get('textarea').element as HTMLTextAreaElement).value).toBe('保留这段修改描述')
  expect(wrapper.text()).toContain('描述已保留')
  expect(createComponentEdit).toHaveBeenCalledTimes(1); expect(push).not.toHaveBeenCalled()
  wrapper.unmount()
})
