import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import AdminPage from './AdminPage.vue'
import { CancellationRejected, cancelTask, getMetrics, listRecords, type RecordPage } from './admin-api'
import { ApiError } from '../../api/http'
import { session, clearSession } from '../auth/session'

const replace = vi.fn()
vi.mock('vue-router', () => ({ useRouter: () => ({ replace }) }))
vi.mock('./admin-api', async original => ({ ...await original<typeof import('./admin-api')>(), cancelTask: vi.fn(), listRecords: vi.fn(), getMetrics: vi.fn() }))
const id = '11111111-1111-4111-8111-111111111111'
const result = (name: string): RecordPage => ({ items: [{ id, createdAt: '2026-10-20T00:00:00Z', status: 'ACTIVE', name }], page: 0, size: 20, total: 1 })
let wrapper: VueWrapper | undefined
beforeEach(() => {
  session.status = 'authenticated'; session.user = { id, role: 'ADMIN', email: 'admin@example.test', displayName: 'Admin' }; session.csrfToken = 'csrf'
  sessionStorage.clear(); vi.mocked(listRecords).mockResolvedValue(result('current'))
  vi.mocked(getMetrics).mockRejectedValue(new Error('metrics unavailable'))
  HTMLDialogElement.prototype.showModal = vi.fn()
  HTMLDialogElement.prototype.close = vi.fn()
})
afterEach(() => { wrapper?.unmount(); wrapper = undefined; clearSession(); vi.resetAllMocks() })
async function page() { wrapper = mount(AdminPage, { global: { stubs: { RouterLink: true } } }); await flushPromises(); return wrapper }

it('an independent metrics failure leaves the actual record table readable', async () => {
  const view = await page()
  expect(view.text()).toContain('metrics unavailable'); expect(view.find('table').exists()).toBe(true)
  expect(view.text()).toContain(id); expect(view.text()).not.toContain('0.0%')
})
it('does not allow a slow task response to replace a later application selection', async () => {
  let finish!: (value: RecordPage) => void
  vi.mocked(listRecords).mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
  const view = await page()
  await view.findAll('.resource-nav button').find(button => button.text() === '应用')!.trigger('click'); await flushPromises()
  expect(view.text()).toContain('current')
  finish(result('stale-task')); await flushPromises()
  expect(view.text()).not.toContain('stale-task'); expect(view.text()).toContain('current')
})
it('clears private rows immediately when role is revoked', async () => {
  const view = await page(); expect(view.text()).toContain(id)
  session.user!.role = 'USER'; await flushPromises()
  expect(view.text()).not.toContain(id); expect(view.find('table').exists()).toBe(false)
  expect(replace).toHaveBeenCalledWith('/apps')
})
it('discards outstanding responses from a previous account', async () => {
  let finish!: (value: RecordPage) => void
  vi.mocked(listRecords).mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
  const view = await page()
  session.user = { ...session.user!, id: '22222222-2222-4222-8222-222222222222' }; await flushPromises()
  finish(result('previous-account')); await flushPromises()
  expect(view.text()).not.toContain('previous-account')
})
it('a malformed or missing list endpoint is an error, never an empty successful table', async () => {
  vi.mocked(listRecords).mockRejectedValue(new Error('D17-A 待完成'))
  const view = await page()
  expect(view.text()).toContain('表格不可用'); expect(view.text()).toContain('D17-A 待完成')
  expect(view.find('table').exists()).toBe(false); expect(view.text()).not.toContain('共 0 条')
})
async function attemptCancellation(view: VueWrapper) {
  await view.get('table button').trigger('click'); await flushPromises()
  await view.get('textarea').setValue('operator reason')
  await view.get('dialog form').trigger('submit'); await flushPromises()
}
it.each([400, 404, 503])('releases a definite rejection (%i), preserves the row and permits retry after remount', async status => {
  vi.mocked(listRecords).mockResolvedValue({ ...result('current'), items: [{ ...result('current').items[0]!, status: 'GENERATE', cancellable: true }] })
  vi.mocked(cancelTask).mockRejectedValue(new CancellationRejected('not changed', status))
  let view = await page()
  await attemptCancellation(view)
  expect(view.text()).toContain('未取消')
  expect(view.text()).not.toContain('结果未知')
  expect(view.get('table button').attributes('disabled')).toBeUndefined()
  expect(view.text()).toContain(id)
  view.unmount(); wrapper = undefined; view = await page()
  expect(view.get('table button').attributes('disabled')).toBeUndefined()
  await attemptCancellation(view)
  expect(cancelTask).toHaveBeenCalledTimes(2)
})
it.each([new ApiError('network'), new ApiError('server', 503), new Error('invalid receipt')])(
  'keeps uncertain cancellation locked across remount (%s)', async error => {
    vi.mocked(listRecords).mockResolvedValue({ ...result('current'), items: [{ ...result('current').items[0]!, status: 'GENERATE', cancellable: true }] })
    vi.mocked(cancelTask).mockRejectedValue(error)
    let view = await page(); await attemptCancellation(view)
    expect(view.text()).toContain('结果未知')
    expect(view.get('table button').attributes('disabled')).toBeDefined()
    view.unmount(); wrapper = undefined; view = await page()
    expect(view.get('table button').attributes('disabled')).toBeDefined()
    expect(cancelTask).toHaveBeenCalledTimes(1)
  },
)
it('clears the rejected intent and private rows on permission loss', async () => {
  vi.mocked(listRecords).mockResolvedValue({ ...result('current'), items: [{ ...result('current').items[0]!, status: 'GENERATE', cancellable: true }] })
  vi.mocked(cancelTask).mockRejectedValue(new ApiError('forbidden', 403))
  const view = await page(); await attemptCancellation(view)
  expect(view.text()).not.toContain(id)
  expect(JSON.parse(sessionStorage.getItem(`codeless.admin.cancel.v1:${id}`)!)).toEqual([])
  expect(replace).toHaveBeenCalledWith({ path: '/apps', query: { reason: 'admin-required' } })
})
it('renders null failure codes as not applicable only for non-failed tasks', async () => {
  vi.mocked(listRecords).mockResolvedValue({ ...result('current'), items: [{ ...result('current').items[0]!, status: 'READY', failureCode: null }] })
  const view = await page()
  expect(view.text()).toContain('不适用')
  vi.mocked(listRecords).mockResolvedValue({ ...result('current'), items: [{ ...result('current').items[0]!, status: 'FAILED', failureCode: null }] })
  await view.findAll('button').find(button => button.text() === '刷新数据')!.trigger('click'); await flushPromises()
  expect(view.text()).toContain('未知 / 未提供'); expect(view.text()).not.toContain('不适用')
})
