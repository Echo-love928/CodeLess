<script setup lang="ts">
import { computed } from 'vue'
import { formatDateTime, stageLabel } from '../../lib/display'
import { eventTypes, type TaskEvent } from '../../lib/events/task-events'
import { stages } from './task-api'
import type { TaskDiagnostics } from './task-diagnostics'
import LogMessage from './LogMessage.vue'

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
    <ol v-else class="task-progress__list" tabindex="0" aria-label="任务事件日志，可滚动查看">
      <li v-for="event in events" :key="event.id" :data-sequence="event.sequence">
        <strong>#{{ event.sequence }} · {{ stageLabel(event.stage) }}</strong>
        <span v-if="!known(event)">未知事件（{{ event.type }}），保留诊断信息。</span>
        <LogMessage :message="event.message.startsWith('PREVIEW_READY ') ? '页面已准备好，可以预览。' : event.message" /><time :datetime="event.occurredAt">{{ formatDateTime(event.occurredAt) }}</time>
      </li>
    </ol>
    <p v-if="diagnosticsError" role="alert">{{ diagnosticsError }}</p>
    <h3>文件变更</h3>
    <p v-if="!diagnostics?.files.available">文件生成后，变更记录会显示在这里。</p>
    <p v-else-if="!diagnostics.files.changes.length">本次任务没有文件变更。</p>
    <ul v-else class="file-changes">
      <li v-for="change in diagnostics.files.changes" :key="change.path" :data-file-path="change.path">
        <strong>{{ changeLabel[change.operation] }} · {{ change.path }}</strong>
        <details><summary>文件校验详情</summary><p>变更前：{{ change.beforeDigest ?? '文件不存在' }}<br>变更后：{{ change.afterDigest ?? '文件已删除' }}</p></details>
      </li>
    </ul>
    <h3>构建与工具摘要</h3>
    <p v-if="!diagnostics?.builds.length">还没有构建结果，请等待页面生成。</p>
    <article v-for="build in diagnostics?.builds ?? []" :key="build.id" :data-build-id="build.id">
      <strong>{{ buildLabel[build.status] }}</strong>
      <details><summary>构建详情</summary><p>构建 {{ build.id }} · 版本 {{ build.versionId }}<br>退出码：{{ build.exitCode ?? '尚无结果' }}<br>制品摘要：{{ build.artifactDigest ?? '尚无制品' }}<br>开始：{{ formatDateTime(build.createdAt) }}<br>完成：{{ build.completedAt ? formatDateTime(build.completedAt) : '尚未完成' }}</p></details>
    </article>
    <p v-if="!tools.length">尚未收到工具事件。</p>
    <LogMessage v-for="event in tools" :key="event.id" :message="`${event.message}（${stageLabel(event.stage)}）`" />
    <h3>错误摘要</h3>
    <p v-if="!failures.length">暂无错误记录。</p>
    <LogMessage v-for="event in failures" :key="event.id" :message="event.message" />
  </section>
</template>

<style scoped>
.task-progress { font-size: 12px; overflow-wrap: anywhere; }
.task-progress h3 { margin: 20px 0 8px; font-size: 12px; }
.task-progress p { line-height: 1.7; color: #6b7484; }
.task-progress__list { padding-left: 20px; max-height: 340px; overflow: auto; }
.task-progress__list li { margin: 14px 0; }
.task-progress__list:focus-visible { outline: 2px solid var(--blue, #4166d2); outline-offset: 2px; }
.task-progress__list strong, .task-progress__list span { display: block; }
.task-progress time { color: #798294; font-size: 11px; }
</style>
