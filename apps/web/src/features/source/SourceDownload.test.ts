import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import SourceDownload from './SourceDownload.vue'
import { exportSource, type SourceArchive } from './export-api'
import type { Version } from '../versions/version-api'
vi.mock('./export-api', () => ({ exportSource: vi.fn() }))
const version: Version = { id: '55555555-5555-4555-8555-555555555555', applicationId: '11111111-1111-4111-8111-111111111111', number: 1,
  status: 'VERIFIED', sourceDigest: 'sha256:' + 'a'.repeat(64), createdAt: '2026-10-19T00:00:00Z' }
beforeEach(() => { vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {}); URL.createObjectURL = vi.fn(() => 'blob:fixture'); URL.revokeObjectURL = vi.fn() })
afterEach(() => { vi.restoreAllMocks(); vi.resetAllMocks() })
it('T4: switches the download version, suppresses stale responses and disables duplicate submissions', async () => {
  let resolve!: (value: SourceArchive) => void
  vi.mocked(exportSource).mockReturnValueOnce(new Promise(done => { resolve = done }))
  const wrapper = mount(SourceDownload, { props: { version } })
  await wrapper.get('button').trigger('click'); await wrapper.get('button').trigger('click')
  expect(exportSource).toHaveBeenCalledTimes(1)
  await wrapper.setProps({ version: { ...version, id: version.applicationId, number: 2 } })
  resolve({ blob: new Blob(['fixture']), filename: 'old.zip' }); await flushPromises()
  expect(URL.createObjectURL).not.toHaveBeenCalled()
  vi.mocked(exportSource).mockResolvedValue({ blob: new Blob(['fixture']), filename: 'new.zip' })
  await wrapper.get('button').trigger('click'); await flushPromises()
  expect(vi.mocked(exportSource).mock.calls[1]![0].id).toBe(version.applicationId)
  expect(wrapper.text()).toContain('版本 v2')
  wrapper.unmount(); expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:fixture')
})
it.each(['DRAFT', 'FAILED'] as const)('disables %s downloads and explains why retry cannot help', async status => {
  const wrapper = mount(SourceDownload, { props: { version: { ...version, status } } })
  expect(wrapper.get('button').attributes('disabled')).toBeDefined()
  expect(wrapper.text()).toContain(status === 'DRAFT' ? '尚未验证' : '验证失败')
  await wrapper.get('button').trigger('click')
  expect(exportSource).not.toHaveBeenCalled()
  wrapper.unmount()
})
it('invalidates a pending download if the version loses VERIFIED status', async () => {
  let resolve!: (value: SourceArchive) => void
  vi.mocked(exportSource).mockReturnValueOnce(new Promise(done => { resolve = done }))
  const wrapper = mount(SourceDownload, { props: { version } })
  await wrapper.get('button').trigger('click')
  await wrapper.setProps({ version: { ...version, status: 'FAILED' } })
  resolve({ blob: new Blob(['fixture']), filename: 'old.zip' }); await flushPromises()
  expect(URL.createObjectURL).not.toHaveBeenCalled()
  expect(wrapper.get('button').attributes('disabled')).toBeDefined()
  wrapper.unmount()
})
