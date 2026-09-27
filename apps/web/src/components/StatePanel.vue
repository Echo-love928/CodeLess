<script setup lang="ts">
import { computed } from 'vue'

type StateKind = 'empty' | 'error' | 'loading'

const props = withDefaults(defineProps<{
  kind: StateKind
  title?: string
  description?: string
  actionLabel?: string
}>(), {
  title: '',
  description: '',
  actionLabel: '',
})

const emit = defineEmits<{ action: [] }>()

const defaults: Record<StateKind, { title: string; description: string; action: string }> = {
  empty: {
    title: '这里还没有内容',
    description: '从左侧选择一个页面，或创建新的应用。',
    action: '',
  },
  error: {
    title: '内容加载失败',
    description: '请检查连接后重试；已有版本不会被覆盖。',
    action: '重试',
  },
  loading: {
    title: '正在准备预览',
    description: '完成后会在这里显示页面。',
    action: '',
  },
}

const content = computed(() => defaults[props.kind])
const visibleTitle = computed(() => props.title || content.value.title)
const visibleDescription = computed(() => props.description || content.value.description)
const visibleAction = computed(() => props.actionLabel || content.value.action)
</script>

<template>
  <section class="state-panel" :class="`state-panel--${kind}`" :aria-busy="kind === 'loading'" :role="kind === 'error' ? 'alert' : 'status'">
    <div class="state-panel__symbol" aria-hidden="true">
      <span v-if="kind === 'empty'">＋</span>
      <span v-else-if="kind === 'error'">!</span>
      <span v-else class="state-panel__spinner" />
    </div>
    <h2>{{ visibleTitle }}</h2>
    <p>{{ visibleDescription }}</p>
    <el-button v-if="visibleAction && kind !== 'loading'" type="primary" @click="emit('action')">
      {{ visibleAction }}
    </el-button>
  </section>
</template>
