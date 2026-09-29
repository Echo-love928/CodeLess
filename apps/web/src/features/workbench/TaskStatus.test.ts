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
