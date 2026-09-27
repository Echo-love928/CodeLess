import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import StatePanel from './StatePanel.vue'

const buttonStub = {
  inheritAttrs: false,
  emits: ['click'],
  template: '<button @click="$emit(\'click\')"><slot /></button>',
}

describe('StatePanel', () => {
  it('shows an actionable empty state with supplied copy', async () => {
    const wrapper = mount(StatePanel, {
      props: {
        kind: 'empty',
        title: '还没有应用',
        description: '先创建一个应用。',
        actionLabel: '创建应用',
      },
      global: { stubs: { ElButton: buttonStub } },
    })
    expect(wrapper.get('[role="status"]').text()).toContain('还没有应用')
    expect(wrapper.text()).toContain('先创建一个应用。')
    await wrapper.get('button').trigger('click')
    expect(wrapper.emitted('action')).toHaveLength(1)
  })

  it('marks errors as alerts and emits retry', async () => {
    const wrapper = mount(StatePanel, {
      props: { kind: 'error' },
      global: { stubs: { ElButton: buttonStub } },
    })
    expect(wrapper.get('[role="alert"]').text()).toContain('内容加载失败')
    await wrapper.get('button').trigger('click')
    expect(wrapper.emitted('action')).toHaveLength(1)
  })

  it('exposes loading state without an action', () => {
    const wrapper = mount(StatePanel, { props: { kind: 'loading' }, global: { stubs: { ElButton: buttonStub } } })
    expect(wrapper.get('[aria-busy="true"]').text()).toContain('正在准备预览')
    expect(wrapper.find('button').exists()).toBe(false)
  })
})
