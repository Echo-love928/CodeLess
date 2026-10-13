import { beforeEach, expect, it, vi } from 'vitest'
import { createComponentEdit, selectComponent, type Mapping, type Selection } from './component-api'
import { session } from '../auth/session'
const request = vi.hoisted(() => vi.fn())
vi.mock('../../api/http', async original => ({ ...await original<object>(), requestJson: request }))
const id = '55555555-5555-4555-8555-555555555555', digest = 'sha256:' + 'a'.repeat(64)
const file = { componentId: 'shared-card', sourceFile: 'src/components/SharedCard.vue', fileDigest: digest, scope: 'SOURCE_FILE' as const }
const mapping: Mapping = { protocol: 'codeless-component-mapping/v1', versionId: id, sourceDigest: digest, components: [file], disabled: [] }
const candidate = { versionId: id, sourceDigest: digest, componentId: 'shared-card' }
const selected: Selection & { selectable: true } = { ...candidate, ...file, selectable: true, shared: true, notice: '所有实例共享' }
beforeEach(() => { request.mockReset(); session.csrfToken = 'explicit-test-csrf' })
it('rejects an old frame before any request and refuses an existing-file remap', async () => {
  await expect(selectComponent(mapping, { ...candidate, versionId: '66666666-6666-4666-8666-666666666666' })).rejects.toThrow('旧版本')
  expect(request).not.toHaveBeenCalled()
  request.mockResolvedValue({ ...selected, sourceFile: 'src/pages/HomePage.vue' })
  await expect(selectComponent(mapping, candidate)).rejects.toThrow('不一致')
})
it('component edit sends only identity, CSRF and idempotency; never a resolved path', async () => {
  request.mockResolvedValue({ task: { id } })
  await createComponentEdit(id, selected, '修改描述', 'test-key')
  const options = request.mock.calls[0]![1]
  expect(JSON.parse(options.body)).toEqual({ baseVersionId: id, prompt: '修改描述', selection: candidate })
  expect(options.headers).toMatchObject({ 'Content-Type': 'application/json', 'X-CSRF-Token': 'explicit-test-csrf', 'Idempotency-Key': 'test-key' })
})
