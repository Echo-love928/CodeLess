<script setup lang="ts">
import { computed } from 'vue'
import type { GenerationTask } from './task-api'
import { failureDescription } from './failure-description'
export type { GenerationTask } from './task-api'

const props = defineProps<{ task: GenerationTask | null }>()
const content = computed(() => {
  if (!props.task) return { title: '暂无生成任务', detail: '提交需求后，任务进度会显示在这里。', kind: 'empty' }
  switch (props.task.status) {
    case 'PLAN': return { title: '正在规划', detail: '任务已排队或正在分析需求。', kind: 'running' }
    case 'GENERATE': return { title: '正在生成', detail: '正在生成 Vue 应用。', kind: 'running' }
    case 'VERIFY': return { title: '正在验证', detail: '正在等待构建与浏览器检查结果。', kind: 'running' }
    case 'REPAIR': return { title: '正在修复', detail: `第 ${props.task.repairAttempts} 次修复。`, kind: 'running' }
    case 'FAILED': return { title: props.task.failureCode === 'CANCELLED' ? '任务已取消' : '生成失败', detail: failureDescription(props.task.failureCode), kind: 'failed' }
    case 'READY': return { title: '生成完成', detail: '验证已完成，可查看已验证版本。', kind: 'ready' }
  }
  return { title: '任务状态未知', detail: '请稍后重试，当前结果不能视为完成。', kind: 'failed' }
})
</script>

<template>
  <section class="task-status" :class="`task-status--${content.kind}`" :role="content.kind === 'failed' ? 'alert' : 'status'" :aria-busy="content.kind === 'running'">
    <span class="task-status__dot" aria-hidden="true" />
    <div><strong>{{ content.title }}</strong><p>{{ content.detail }}</p><small v-if="task">任务 {{ task.id }} · {{ task.status }}</small><small v-if="task">已执行修复：{{ task.repairAttempts }} / 3 轮</small><small v-if="task?.status === 'FAILED'">错误代码：{{ task.failureCode || '未知' }}</small></div>
  </section>
</template>

<style scoped>
.task-status { display: flex; align-items: flex-start; gap: 11px; padding: 15px; background: #f7f8fb; border: 1px solid #e1e5ec; border-radius: 8px; font-size: 12px; }
.task-status__dot { width: 9px; height: 9px; flex: none; margin-top: 4px; border-radius: 50%; background: #8b93a0; }
.task-status--running .task-status__dot { background: #4166d2; }
.task-status--failed .task-status__dot { background: #bc443e; }
.task-status--ready .task-status__dot { background: #398065; }
.task-status strong { font-weight: 600; }
.task-status p { margin: 5px 0 0; color: #6b7484; line-height: 1.6; }
.task-status small { display: block; margin-top: 8px; color: #798294; overflow-wrap: anywhere; }
</style>
