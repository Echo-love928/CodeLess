<script setup lang="ts">
import { onBeforeUnmount, provide, ref, watch } from 'vue'
import { ApiError } from '../../api/http'
import PreviewPanel from '../preview/PreviewPanel.vue'
import SourcePanel from '../source/SourcePanel.vue'
import { listVersions, type Version } from './version-api'
import { editContext, useVisualEditFlow } from '../visual-edit/edit-flow'
import TaskStatus from '../workbench/TaskStatus.vue'
import TaskProgress from '../workbench/TaskProgress.vue'

const props = defineProps<{ applicationId: string; versionId?: string | null; buildFailed?: boolean; refreshVersion?: () => Promise<void>; refreshKey?: string; taskId?: string; taskVersionIds?: string[] }>()
const emit = defineEmits<{ unauthorized: [] }>()
const previewId = ref(props.versionId)
const selected = ref<Version>()
const items = ref<Version[]>([])
const page = ref(0)
const total = ref(0)
const loading = ref(false)
const error = ref('')
const labels = { DRAFT: '草稿 · 未验证', VERIFIED: '已通过验证', FAILED: '验证失败' }
const sourceTask = (item: Version) => item.taskId
let generation = 0
let abort: AbortController | undefined
const flow = useVisualEditFlow(() => props.applicationId, version => {
  previewId.value = version.id; selected.value = version; void load(0)
  const app = props.applicationId
  // Refresh the surrounding application summary without substituting its latest pointer for this task's version.
  if (props.refreshVersion) void props.refreshVersion().catch(cause => {
    if (app !== props.applicationId || result.value?.id !== version.id) return
    editError.value = '无法更新应用当前版本摘要；此任务的已验证新版本仍可预览。'
    if (cause instanceof ApiError && cause.status === 401) emit('unauthorized')
  })
}, () => emit('unauthorized'))
const { task: editTask, accepted, description, component, result, locked, error: editError, events, diagnostics,
  diagnosticsError, connection, refreshing, cancelling } = flow
provide(editContext, { locked, begin: flow.begin, accept: flow.accept })
async function load(nextPage = page.value) {
  const current = ++generation
  abort?.abort(); abort = new AbortController()
  loading.value = true; error.value = ''; items.value = []
  try {
    const value = await listVersions(props.applicationId, nextPage, abort.signal)
    if (current !== generation) return
    items.value = value.items; total.value = value.total; page.value = value.page
    // Keep a selected immutable snapshot across pagination; never silently switch preview.
    if (!selected.value) selected.value = value.items.find(item => item.id === previewId.value)
  } catch (cause) {
    if (current !== generation) return
    error.value = cause instanceof ApiError && cause.status === 404
      ? '版本列表尚不可用或你无权访问。请确认版本接口已接入。'
      : cause instanceof Error ? cause.message : '版本读取失败，请重试。'
    if (cause instanceof ApiError && cause.status === 401) emit('unauthorized')
  } finally { if (current === generation) loading.value = false }
}
function select(item: Version) {
  if (locked.value) return
  selected.value = item
  if (item.status === 'VERIFIED' && item.buildId) previewId.value = item.id
}
watch(() => props.applicationId, () => {
  flow.reset()
  selected.value = undefined; previewId.value = props.versionId; page.value = 0; total.value = 0
  void load(0)
}, { immediate: true })
watch(() => props.versionId, id => {
  if (locked.value || result.value) return
  previewId.value = id; selected.value = undefined
  void load(0)
})
watch(() => props.refreshKey, () => { void load(0) })
onBeforeUnmount(() => { generation++; abort?.abort(); flow.reset() })
</script>

<template>
  <div class="version-workspace">
    <PreviewPanel :application-id="applicationId" :version-id="previewId" :build-failed="buildFailed" :refresh-version="refreshVersion" @unauthorized="emit('unauthorized')" />
    <section v-if="accepted" class="edit-result" aria-label="组件修改任务">
      <h2>组件修改任务</h2>
      <p>组件：{{ component }} · 基版本：{{ accepted.baseVersionId }}</p>
      <p>修改说明：{{ description }}</p>
      <TaskStatus :task="editTask" />
      <p v-if="!editTask" role="status">修改任务已受理，正在读取状态。旧版本继续保留。</p>
      <p v-if="result" role="status">修改成功，产出此任务的已验证版本 {{ result.id }}。{{ previewId === result.id ? '当前预览已切换至新版本。旧选择已清理，请重新选择组件。' : '当前正在查看其他历史版本。' }}</p>
      <p v-else-if="editTask?.status === 'FAILED'" role="status">{{ editTask.failureCode === 'CANCELLED' ? '修改已取消' : '修改失败' }}。旧版本仍可用，可继续预览、选择组件并修改。</p>
      <p v-else-if="editTask?.status === 'READY'" role="status">任务报告 READY，正在核对确切版本；确认前保留旧预览。</p>
      <p v-else-if="editTask" role="status">修改进行中，旧版本可继续预览；验证完成前不能发起下一次修改。</p>
      <p v-if="editError" role="alert">{{ editError }}</p>
      <p v-if="connection">事件连接：{{ connection }}</p>
      <button type="button" class="button-secondary" :disabled="refreshing" @click="flow.refresh">{{ refreshing ? '正在刷新修改状态…' : '刷新修改状态' }}</button>
      <button v-if="editTask && !['READY', 'FAILED'].includes(editTask.status)" type="button" class="button-secondary" :disabled="cancelling" @click="flow.cancel">{{ cancelling ? '正在取消修改…' : '取消修改任务' }}</button>
      <router-link :to="{ path: `/workbench/${applicationId}`, query: { taskId: accepted.task.id } }">任务恢复链接</router-link>
      <details><summary>查看修改日志与构建结果</summary><TaskProgress :events="events" :diagnostics="diagnostics" :diagnostics-error="diagnosticsError" /></details>
    </section>
    <section class="versions-panel" aria-label="版本记录">
      <div class="versions-heading"><h2>版本记录</h2><button type="button" class="button-secondary" :disabled="loading" @click="load()">刷新版本</button></div>
      <p v-if="loading" role="status">正在读取版本列表…</p>
      <p v-else-if="error" role="alert">{{ error }}</p>
      <p v-else-if="!items.length" role="status">暂无版本记录。完成生成后可在此查看。</p>
      <template v-else>
        <ul>
          <li v-for="item in items" :key="item.id" :data-version-id="item.id">
            <div><strong>版本 {{ item.number }}</strong> <span>{{ labels[item.status] }}</span><span v-if="item.id === previewId"> · 当前预览</span><span v-if="item.id === versionId"> · 当前可用</span></div>
            <time :datetime="item.createdAt">{{ new Date(item.createdAt).toLocaleString('zh-CN') }}</time>
            <p>来源任务：<router-link v-if="sourceTask(item)" :to="{ path: `/workbench/${applicationId}`, query: { taskId: sourceTask(item) } }">{{ sourceTask(item) }}</router-link><span v-else>未提供来源任务</span></p>
            <p v-if="item.status === 'FAILED'" class="version-error">错误摘要：{{ item.errorSummary || '服务端未提供错误摘要。' }}</p>
            <button type="button" class="button-secondary" :disabled="locked" :aria-pressed="selected?.id === item.id" @click="select(item)">{{ item.status === 'VERIFIED' ? '查看源码并预览' : '查看源码' }}</button>
            <span v-if="item.status !== 'VERIFIED'"> 此版本不可预览。</span>
          </li>
        </ul>
        <nav aria-label="版本分页"><button type="button" class="button-secondary" :disabled="page === 0" @click="load(page - 1)">上一页</button><span>第 {{ page + 1 }} 页 · 共 {{ total }} 个版本</span><button type="button" class="button-secondary" :disabled="(page + 1) * 20 >= total" @click="load(page + 1)">下一页</button></nav>
      </template>
    </section>
    <SourcePanel :version="selected" @unauthorized="emit('unauthorized')" />
  </div>
</template>

<style scoped>
.version-workspace { width: 100%; min-width: 0; }
.edit-result { padding: 20px; background: white; border-top: 1px solid #e1e5ec; font-size: 13px; overflow-wrap: anywhere; }
.edit-result button, .edit-result summary { min-height: 44px; margin-right: 10px; }
.edit-result details { margin-top: 14px; }
.edit-result summary { cursor: pointer; padding: 12px 0; }
.versions-panel { padding: 20px; background: white; border-top: 1px solid #e1e5ec; font-size: 13px; }
.versions-heading, nav { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 12px; }
h2 { font-size: 15px; margin: 0; }
ul { list-style: none; padding: 0; margin: 12px 0; }
li { padding: 14px 0; border-bottom: 1px solid #e1e5ec; overflow-wrap: anywhere; }
time { display: block; margin-top: 8px; color: #687384; }
.version-error { color: #8b4d18; white-space: pre-wrap; }
nav { justify-content: flex-start; }
</style>
