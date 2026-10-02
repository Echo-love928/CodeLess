<script setup lang="ts">
import { computed } from 'vue'
import { eventTypes, type TaskEvent } from '../../lib/events/task-events'
import { stages } from './task-api'
import type { TaskDiagnostics } from './task-diagnostics'

const props = defineProps<{ events: TaskEvent[]; diagnostics?: TaskDiagnostics | null; diagnosticsError?: string }>()
const tools = computed(() => props.events.filter(event => event.type === 'TOOL_RESULT'))
const failures = computed(() => props.events.filter(event => event.type === 'TASK_FAILED'))
const known = (event: TaskEvent) => eventTypes.includes(event.type) && stages.includes(event.stage as typeof stages[number])
const changeLabel = { ADDED: '新增', MODIFIED: '修改', DELETED: '删除' }
const buildLabel = { QUEUED: '排队中', RUNNING: '构建中', SUCCEEDED: '构建成功', FAILED: '构建失败' }
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
    <p v-if="diagnosticsError" role="alert">{{ diagnosticsError }}</p>
    <h3>文件变更</h3>
    <p v-if="!diagnostics?.files.available">尚无文件变更记录；生成生产者还未提供结果。</p>
    <p v-else-if="!diagnostics.files.changes.length">生产者已确认本轮无文件变更。</p>
    <ul v-else class="file-changes">
      <li v-for="change in diagnostics.files.changes" :key="change.path" :data-file-path="change.path">
        <strong>{{ changeLabel[change.operation] }} · {{ change.path }}</strong>
        <p>变更前：{{ change.beforeDigest ?? '文件不存在' }}<br>变更后：{{ change.afterDigest ?? '文件已删除' }}</p>
      </li>
    </ul>
    <h3>构建与工具摘要</h3>
    <p v-if="!diagnostics?.builds.length">尚无持久化构建结果，不能视为构建成功。</p>
    <article v-for="build in diagnostics?.builds ?? []" :key="build.id" :data-build-id="build.id">
      <strong>{{ buildLabel[build.status] }}</strong>
      <p>构建 {{ build.id }} · 版本 {{ build.versionId }}<br>退出码：{{ build.exitCode ?? '尚无结果' }}<br>制品摘要：{{ build.artifactDigest ?? '尚无制品' }}<br>开始：{{ build.createdAt }}<br>完成：{{ build.completedAt ?? '尚未完成' }}</p>
    </article>
    <p v-if="!tools.length">尚未收到工具事件。</p>
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
