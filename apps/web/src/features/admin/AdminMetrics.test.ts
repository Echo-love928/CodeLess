import { afterEach, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import AdminMetrics from './AdminMetrics.vue'
import { getGenerationTrend } from './admin-api'
import { ApiError } from '../../api/http'
import { session, clearSession } from '../auth/session'
vi.mock('./admin-api', async original => ({ ...await original<typeof import('./admin-api')>(), getGenerationTrend: vi.fn() }))
afterEach(() => { clearSession(); vi.resetAllMocks() })
it('propagates lost authorization from a lazy trend read so the parent clears all private records', async () => {
  session.status = 'authenticated'; session.user = { id: 'admin', role: 'ADMIN', email: 'admin@example.test', displayName: 'Admin' }
  vi.mocked(getGenerationTrend).mockRejectedValue(new ApiError('forbidden', 403))
  const counts = { succeeded: 0, failed: 0, pending: 0, cancelled: 0, unknown: 0 }
  const wrapper = mount(AdminMetrics, { props: { filters: { status: '', ownerId: '', from: '', to: '' },
    metrics: { generation: counts, deployment: counts, usage: { inputTokens: null, outputTokens: null, unknownCalls: 1 }, trend: [] } } })
  wrapper.get('details').element.open = true
  await wrapper.get('details').trigger('toggle'); await flushPromises()
  expect(wrapper.emitted('authorization-error')?.[0]?.[0]).toMatchObject({ kind: 'forbidden' })
  wrapper.unmount()
})
