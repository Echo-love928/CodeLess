import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import taskFixture from '../../../../../contracts/examples/v0/valid/task.json'
import TaskStatus, { type GenerationTask } from './TaskStatus.vue'

const task = taskFixture as GenerationTask

describe('TaskStatus contract states', () => {
  it('shows generation in progress without claiming completion', () => {
    const wrapper = mount(TaskStatus, { props: { task: { ...task, status: 'GENERATE' } } })
    expect(wrapper.get('[role="status"]').attributes('aria-busy')).toBe('true')
    expect(wrapper.text()).toContain('正在生成')
    expect(wrapper.text()).not.toContain('生成完成')
  })

  it('shows a failure and its diagnostic code', () => {
    const wrapper = mount(TaskStatus, { props: { task: { ...task, status: 'FAILED', failureCode: 'BUILD_FAILED' } } })
    expect(wrapper.get('[role="alert"]').text()).toContain('生成失败')
    expect(wrapper.text()).toContain('BUILD_FAILED')
  })

  it('shows completion only for READY', () => {
    const wrapper = mount(TaskStatus, { props: { task } })
    expect(wrapper.get('[role="status"]').attributes('aria-busy')).toBe('false')
    expect(wrapper.text()).toContain('生成完成')
  })
})

it('retains repair attempts and budget failure explanation in terminal states', () => {
  const wrapper = mount(TaskStatus, { props: { task: { ...task, status: 'FAILED', repairAttempts: 3, failureCode: 'MODEL_BUDGET_EXCEEDED' } } })
  expect(wrapper.text()).toContain('已执行修复：3 / 3 轮')
  expect(wrapper.text()).toContain('预算已耗尽')
  expect(wrapper.text()).toContain('MODEL_BUDGET_EXCEEDED')
  expect(wrapper.text()).not.toContain('生成完成')
})

it('keeps unknown states and codes explicit without assuming success', () => {
  const wrapper = mount(TaskStatus, { props: { task: { ...task, status: 'FAILED', failureCode: 'NEW_FAILURE' } } })
  expect(wrapper.text()).toContain('NEW_FAILURE')
  expect(wrapper.text()).toContain('联系维护者确认')
  const unknown = mount(TaskStatus, { props: { task: { ...task, status: 'FUTURE_STATE' } } })
  expect(unknown.text()).toContain('任务状态未知')
  expect(unknown.text()).not.toContain('生成完成')
})
