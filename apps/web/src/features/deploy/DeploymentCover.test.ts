import { afterEach, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import DeploymentCover from './DeploymentCover.vue'
import { getCover, type Cover } from './cover-api'
import type { Publication } from './deploy-api'
vi.mock('./cover-api', () => ({ getCover: vi.fn() }))
const publication: Publication = { id: '55555555-5555-4555-8555-555555555555', applicationId: '11111111-1111-4111-8111-111111111111',
  versionId: '66666666-6666-4666-8666-666666666666', requestedBy: 'user', status: 'PUBLISHED', url: 'https://fixture.test/', createdAt: '2026-10-19T00:00:00Z' }
const cover: Cover = { deploymentId: publication.id, applicationId: publication.applicationId, versionId: publication.versionId,
  sourceDigest: 'sha256:' + 'a'.repeat(64), artifactDigest: 'sha256:' + 'b'.repeat(64), status: 'FAILED', attempts: 2,
  failureCode: 'CAPTURE_TIMEOUT', imageDigest: null, imageBytes: null }
afterEach(() => vi.resetAllMocks())
it('T2: timeout uses a stable placeholder and explicitly preserves published status', async () => {
  vi.mocked(getCover).mockResolvedValue(cover)
  const wrapper = mount(DeploymentCover, { props: { publication } }); await flushPromises()
  expect(wrapper.get('[role=img]').attributes('aria-label')).toBe('应用封面占位图')
  expect(wrapper.text()).toContain('网站仍已发布')
  expect(publication.status).toBe('PUBLISHED'); wrapper.unmount()
})
it('renders only platform-owned image paths and falls back when the image fails', async () => {
  vi.mocked(getCover).mockResolvedValue({ ...cover, status: 'SUCCEEDED', failureCode: null, imageDigest: 'sha256:' + 'c'.repeat(64), imageBytes: 120 })
  const wrapper = mount(DeploymentCover, { props: { publication } }); await flushPromises()
  expect(wrapper.get('img').attributes('src')).toContain(`/api/v0/publications/${publication.id}/cover/image`)
  await wrapper.get('img').trigger('error')
  expect(wrapper.text()).toContain('网站仍已发布'); wrapper.unmount()
})
