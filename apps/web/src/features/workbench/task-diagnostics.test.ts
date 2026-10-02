import { describe, expect, it } from 'vitest'
import fixture from '../../../../../contracts/examples/v0/valid/task-diagnostics.json'
import { validateDiagnostics, type TaskDiagnostics } from './task-diagnostics'

const fresh = () => structuredClone(fixture) as TaskDiagnostics
describe('structured task diagnostics boundary', () => {
  it('accepts persisted metadata and distinguishes absent producer data from confirmed empty changes', () => {
    const value = fresh()
    expect(validateDiagnostics(value, value.taskId)).toEqual(value)
    for (const files of [{ available: false, revision: 0, changes: [] }, { available: true, revision: 1, changes: [] }]) {
      expect(validateDiagnostics({ ...value, files, builds: [] }, value.taskId).files).toEqual(files)
    }
  })
  it('rejects traversal, repeated paths, mismatched identity and invented build success', () => {
    const value = fresh()
    const invalid = [
      { ...value, taskId: '99999999-9999-4999-8999-999999999999' },
      { ...value, files: { ...value.files, changes: [{ ...value.files.changes[0], path: '../../.env' }] } },
      { ...value, files: { ...value.files, changes: [...value.files.changes, ...value.files.changes] } },
      { ...value, files: { ...value.files, available: false } },
      { ...value, builds: [{ ...value.builds[0], status: 'SUCCEEDED', exitCode: 0 }] },
      { ...value, builds: [{ ...value.builds[0], status: 'FUTURE' }] },
      { ...value, builds: [{ ...value.builds[0], status: 'RUNNING' }] },
      { ...value, files: { ...value.files, changes: Array(41).fill(value.files.changes[0]) } },
      { ...value, builds: Array(101).fill(value.builds[0]) },
    ]
    for (const item of invalid) expect(() => validateDiagnostics(item as TaskDiagnostics, value.taskId)).toThrow()
  })
})
