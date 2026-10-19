import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import DeployPanel from './DeployPanel.vue'
import { createPublication, getPublication, listPublications, verifiedArtifact, type Publication } from './deploy-api'
import { getVersion, type Version } from '../versions/version-api'
import { session } from '../auth/session'

vi.mock('./deploy-api', () => ({ createPublication: vi.fn(), getPublication: vi.fn(), listPublications: vi.fn(), verifiedArtifact: vi.fn(), loadPublicOrigin: async () => new URL('https://sites.codeless-public.test') }))
vi.mock('../versions/version-api', () => ({ getVersion: vi.fn() }))
const app = '11111111-1111-4111-8111-111111111111', user = '77777777-7777-4777-8777-777777777777'
const id1 = '55555555-5555-4555-8555-555555555555', id2 = '66666666-6666-4666-8666-666666666666'
const version = (id: string): Version => ({ id, applicationId: app, status: 'VERIFIED', number: 1, buildId: id2, sourceDigest: 'sha256:' + 'a'.repeat(64), createdAt: '2026-10-14T00:00:00Z' })
const publication = (status: Publication['status'], id = id1): Publication => ({ id, applicationId: app, versionId: id1, requestedBy: user, status,
  createdAt: '2026-10-14T00:00:00Z', ...(status === 'PUBLISHED' ? { url: `https://d${id.replaceAll('-', '')}.sites.codeless-public.test/`, publishedAt: '2026-10-14T00:01:00Z' } : {}) })
beforeEach(() => {
  sessionStorage.clear(); session.status = 'authenticated'; session.csrfToken = 'csrf'; session.user = { id: user, email: 'demo@example.test', displayName: 'Demo', role: 'USER' }
  vi.mocked(listPublications).mockResolvedValue({ items: [], latestSuccessful: null })
  vi.mocked(verifiedArtifact).mockResolvedValue('sha256:' + 'b'.repeat(64))
  vi.mocked(getVersion).mockImplementation(async id => version(id))
})
afterEach(() => vi.resetAllMocks())
async function panel() {
  const wrapper = mount(DeployPanel, { props: { applicationId: app, versionId: id1 } })
  await flushPromises(); await wrapper.get('button').trigger('click'); await flushPromises()
  return wrapper
}
it('requires explicit confirmation, submits one frozen version and locks double clicks', async () => {
  let resolve!: (value: Publication) => void
  vi.mocked(createPublication).mockReturnValue(new Promise(done => { resolve = done }))
  const wrapper = await panel()
  const button = () => wrapper.findAll('button').find(button => button.text().includes('确认发布') || button.text().includes('正在提交发布'))!
  expect(button().attributes('disabled')).toBeDefined()
  expect(createPublication).not.toHaveBeenCalled()
  await wrapper.get('input').setValue(true); await button().trigger('click'); await button().trigger('click')
  expect(createPublication).toHaveBeenCalledTimes(1); expect(createPublication).toHaveBeenCalledWith({ applicationId: app, versionId: id1, artifactDigest: 'sha256:' + 'b'.repeat(64), key: expect.any(String) })
  await wrapper.setProps({ versionId: id2 }); await flushPromises()
  resolve(publication('REQUESTED')); await flushPromises()
  expect(wrapper.text()).toContain(`版本：${id1}`)
  expect(wrapper.get('input').attributes('disabled')).toBeDefined()
  wrapper.unmount()
})
it('D15-B-T4: restores server-confirmed success and preserves it after failed deployment', async () => {
  vi.mocked(listPublications).mockResolvedValue({ items: [], latestSuccessful: publication('PUBLISHED', id2) })
  vi.mocked(getPublication).mockResolvedValue(publication('PUBLISHED', id2))
  vi.mocked(createPublication).mockResolvedValue(publication('REQUESTED'))
  const wrapper = await panel()
  await wrapper.get('input').setValue(true)
  await wrapper.findAll('button').find(button => button.text() === '确认发布')!.trigger('click'); await flushPromises()
  vi.mocked(getPublication).mockResolvedValue(publication('FAILED'))
  await wrapper.findAll('button').find(button => button.text() === '刷新发布状态')!.trigger('click'); await flushPromises()
  expect(wrapper.text()).toContain('上次成功版本和地址仍然保留')
  expect(wrapper.get('a').attributes('href')).toBe(publication('PUBLISHED', id2).url)
  expect(listPublications).toHaveBeenCalledWith(app)
  wrapper.unmount()
})
it('invalid/unknown POST result remains blocked, with no automatic retry after reopening', async () => {
  vi.mocked(createPublication).mockRejectedValue(new Error('invalid result'))
  const wrapper = await panel(); await wrapper.get('input').setValue(true)
  await wrapper.findAll('button').find(button => button.text() === '确认发布')!.trigger('click'); await flushPromises()
  expect(wrapper.text()).toContain('提交结果未知')
  expect(createPublication).toHaveBeenCalledTimes(1)
  wrapper.unmount()
  const reopened = await panel(); expect(reopened.text()).toContain('上次提交结果未知')
  expect(reopened.findAll('button').find(button => button.text() === '确认发布')!.attributes('disabled')).toBeDefined()
  reopened.unmount()
})
it('late responses cannot update a different application', async () => {
  let resolve!: (value: Publication) => void
  vi.mocked(createPublication).mockReturnValue(new Promise(done => { resolve = done }))
  const wrapper = await panel(); await wrapper.get('input').setValue(true)
  await wrapper.findAll('button').find(button => button.text() === '确认发布')!.trigger('click')
  await wrapper.setProps({ applicationId: id2 }); resolve(publication('PUBLISHED')); await flushPromises()
  expect(wrapper.find('a').exists()).toBe(false); expect(wrapper.text()).not.toContain('发布成功')
  wrapper.unmount()
})

it('explicit retry after a lost response/reload preserves the complete intent and idempotency key', async () => {
  vi.mocked(createPublication).mockRejectedValueOnce(new Error('response lost'))
  const wrapper = await panel(); await wrapper.get('input').setValue(true)
  await wrapper.findAll('button').find(button => button.text() === '确认发布')!.trigger('click'); await flushPromises()
  const binding = vi.mocked(createPublication).mock.calls[0]![0]
  wrapper.unmount()
  vi.mocked(createPublication).mockResolvedValue(publication('REQUESTED'))
  const reopened = await panel()
  expect(createPublication).toHaveBeenCalledTimes(1)
  await reopened.findAll('button').find(button => button.text().includes('重试本次提交'))!.trigger('click'); await flushPromises()
  expect(vi.mocked(createPublication).mock.calls[1]![0]).toEqual(binding)
  reopened.unmount()
})
it('cold session discovers server success when newest attempt failed and ignores malformed local storage', async () => {
  sessionStorage.setItem(`codeless:publication:${user}:${app}`, '{bad')
  vi.mocked(listPublications).mockResolvedValue({ items: [publication('FAILED')], latestSuccessful: publication('PUBLISHED', id2) })
  const wrapper = await panel()
  expect(wrapper.get('a').attributes('href')).toBe(publication('PUBLISHED', id2).url)
  expect(wrapper.text()).toContain('发布失败')
  expect(createPublication).not.toHaveBeenCalled()
  wrapper.unmount()
})
it('cold session preserves independent server success and blocks when attempts cannot be confirmed', async () => {
  vi.mocked(listPublications).mockResolvedValue({ items: [], latestSuccessful: publication('PUBLISHED', id2), uncertain: true })
  const wrapper = await panel()
  expect(wrapper.get('a').attributes('href')).toBe(publication('PUBLISHED', id2).url)
  expect(wrapper.text()).toContain('提交结果未知')
  expect(wrapper.findAll('button').find(button => button.text() === '确认发布')!.attributes('disabled')).toBeDefined()
  expect(createPublication).not.toHaveBeenCalled()
  wrapper.unmount()
})
it('an old successful idempotent replay reconciles the independent newer success pointer', async () => {
  vi.mocked(listPublications).mockResolvedValue({ items: [], latestSuccessful: publication('PUBLISHED', id2) })
  vi.mocked(createPublication).mockResolvedValue(publication('PUBLISHED', id1))
  const wrapper = await panel(); await wrapper.get('input').setValue(true)
  await wrapper.findAll('button').find(button => button.text() === '确认发布')!.trigger('click'); await flushPromises()
  expect(wrapper.get('a').attributes('href')).toBe(publication('PUBLISHED', id2).url)
  wrapper.unmount()
})
