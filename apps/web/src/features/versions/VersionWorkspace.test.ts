import { afterEach, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import VersionWorkspace from './VersionWorkspace.vue'
import { listVersions, type VersionPage } from './version-api'

vi.mock('./version-api', () => ({ listVersions: vi.fn() }))
const get = vi.mocked(listVersions)
afterEach(() => vi.clearAllMocks())
const app1 = '11111111-1111-4111-8111-111111111111', app2 = '22222222-2222-4222-8222-222222222222'

it('ignores a late application list after navigation, including its error and unauthorized event', async () => {
  let rejectOld!: (error: Error) => void
  get.mockReturnValueOnce(new Promise((_resolve, reject) => { rejectOld = reject }))
  const wrapper = mount(VersionWorkspace, { props: { applicationId: app1 }, global: { stubs: { PreviewPanel: true, SourcePanel: true, RouterLink: true } } })
  get.mockResolvedValueOnce({ items: [], page: 0, size: 20, total: 0 })
  await wrapper.setProps({ applicationId: app2 }); await flushPromises()
  rejectOld(new Error('迟到错误')); await flushPromises()
  expect(wrapper.text()).toContain('暂无版本记录')
  expect(wrapper.text()).not.toContain('迟到错误')
  expect(wrapper.emitted('unauthorized')).toBeUndefined()
  wrapper.unmount()
})

it('does not resurrect an earlier list after a task refresh', async () => {
  let resolveOld!: (page: VersionPage) => void
  get.mockReturnValueOnce(new Promise(resolve => { resolveOld = resolve }))
  const wrapper = mount(VersionWorkspace, { props: { applicationId: app1, refreshKey: 'task:VERIFY' }, global: { stubs: { PreviewPanel: true, SourcePanel: true, RouterLink: true } } })
  get.mockResolvedValueOnce({ items: [], page: 0, size: 20, total: 0 })
  await wrapper.setProps({ refreshKey: 'task:FAILED' }); await flushPromises()
  resolveOld({ items: [{ id: '55555555-5555-4555-8555-555555555555', applicationId: app1, number: 1, sourceDigest: 'sha256:' + 'a'.repeat(64), status: 'DRAFT', createdAt: '2026-10-11T00:00:00Z' }], page: 0, size: 20, total: 1 })
  await flushPromises()
  expect(wrapper.find('[data-version-id]').exists()).toBe(false)
  wrapper.unmount()
})

it('only links persisted origin tasks and does not infer unknown origins from current diagnostics', async () => {
  const taskId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', id = '55555555-5555-4555-8555-555555555555'
  get.mockResolvedValue({ items: [{ id, applicationId: app1, number: 1, sourceDigest: 'sha256:' + 'a'.repeat(64), status: 'DRAFT', createdAt: '2026-10-12T00:00:00Z' }], page: 0, size: 20, total: 1 })
  const wrapper = mount(VersionWorkspace, { props: { applicationId: app1, taskId, taskVersionIds: [app2] }, global: { stubs: { PreviewPanel: true, SourcePanel: true, RouterLink: { template: '<a><slot /></a>' } } } })
  await flushPromises()
  expect(wrapper.text()).toContain('未提供来源任务')
  await wrapper.setProps({ taskVersionIds: [id] })
  expect(wrapper.text()).toContain('未提供来源任务')
  expect(wrapper.text()).not.toContain(taskId)
  get.mockResolvedValue({ items: [{ id, applicationId: app1, number: 1, sourceDigest: 'sha256:' + 'a'.repeat(64), status: 'DRAFT', createdAt: '2026-10-12T00:00:00Z', taskId }], page: 0, size: 20, total: 1 })
  await wrapper.setProps({ refreshKey: 'persisted-origin' }); await flushPromises()
  expect(wrapper.text()).toContain(taskId)
  wrapper.unmount()
})
