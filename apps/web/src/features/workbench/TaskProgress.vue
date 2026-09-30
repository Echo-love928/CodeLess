<script setup lang="ts">
import { computed } from 'vue'
import { eventTypes, type TaskEvent } from '../../lib/events/task-events'
import { stages } from './task-api'

const props = defineProps<{ events: TaskEvent[] }>()
const tools = computed(() => props.events.filter(event => event.type === 'TOOL_RESULT'))
const failures = computed(() => props.events.filter(event => event.type === 'TASK_FAILED'))
const known = (event: TaskEvent) => eventTypes.includes(event.type) && stages.includes(event.stage as typeof stages[number])
</script>

<template>
  <section class="task-progress" aria-label="任务事件">
    <p v-if="!events.length">尚未收到任务事件。</p>
    <ol v-else class="task-progress__list">
      <li v-for="event in events" :key="event.id" :data-sequence="event.sequence">
        <strong>#{{ event.sequence }} · {{ event.stage }}</strong>
        <span v-if="!known(event)">未知事件（{{ event.type }}），保留诊断信息。</span>
        <p>{{ event.message }}</p><time :datetime="event.occurredAt">{{ event.occurredAt }}</time>
      </li>
    </ol>
    <h3>文件变更</h3><p>当前事件接口未提供文件路径或差异清单。</p>
    <h3>构建与工具摘要</h3>
    <p v-if="!tools.length">尚未收到构建或工具结果。</p>
    <p v-for="event in tools" :key="event.id">{{ event.message }}（{{ event.stage }}）</p>
    <h3>错误摘要</h3>
    <p v-if="!failures.length">尚未收到错误事件；任务最终结果以状态查询为准。</p>
    <p v-for="event in failures" :key="event.id">{{ event.message }}</p>
  </section>
</template>

<style scoped>
.task-progress { font-size: 12px; overflow-wrap: anywhere; }
.task-progress h3 { margin: 20px 0 8px; font-size: 12px; }
.task-progress p { line-height: 1.7; color: #6b7484; }
.task-progress__list { padding-left: 20px; max-height: 340px; overflow: auto; }
.task-progress__list li { margin: 14px 0; }
.task-progress__list strong, .task-progress__list span { display: block; }
.task-progress time { color: #798294; font-size: 11px; }
</style>
