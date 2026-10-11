<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue'
import { ApiError } from '../../api/http'
import PreviewPanel from '../preview/PreviewPanel.vue'
import SourcePanel from '../source/SourcePanel.vue'
import { listVersions, type Version } from './version-api'

const props = defineProps<{ applicationId: string; versionId?: string | null; buildFailed?: boolean; refreshVersion?: () => Promise<void>; refreshKey?: string }>()
const emit = defineEmits<{ unauthorized: [] }>()
const previewId = ref(props.versionId)
const selected = ref<Version>()
const items = ref<Version[]>([])
const page = ref(0)
const total = ref(0)
const loading = ref(false)
const error = ref('')
const labels = { DRAFT: '草稿 · 未验证', VERIFIED: '已通过验证', FAILED: '验证失败' }
let generation = 0
let abort: AbortController | undefined
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
  selected.value = item
  if (item.status === 'VERIFIED' && item.buildId) previewId.value = item.id
}
watch(() => props.applicationId, () => {
  selected.value = undefined; previewId.value = props.versionId; page.value = 0; total.value = 0
  void load(0)
}, { immediate: true })
watch(() => props.versionId, id => {
  previewId.value = id; selected.value = undefined
  void load(0)
})
watch(() => props.refreshKey, () => { void load(0) })
onBeforeUnmount(() => { generation++; abort?.abort() })
</script>

<template>
  <div class="version-workspace">
    <PreviewPanel :application-id="applicationId" :version-id="previewId" :build-failed="buildFailed" :refresh-version="refreshVersion" @unauthorized="emit('unauthorized')" />
    <section class="versions-panel" aria-label="版本记录">
      <div class="versions-heading"><h2>版本记录</h2><button type="button" class="button-secondary" :disabled="loading" @click="load()">刷新版本</button></div>
      <p v-if="loading" role="status">正在读取版本列表…</p>
      <p v-else-if="error" role="alert">{{ error }}</p>
      <p v-else-if="!items.length" role="status">暂无版本记录。完成生成后可在此查看。</p>
      <template v-else>
        <ul>
          <li v-for="item in items" :key="item.id" :data-version-id="item.id">
            <div><strong>版本 {{ item.number }}</strong> <span>{{ labels[item.status] }}</span><span v-if="item.id === previewId"> · 当前预览</span></div>
            <time :datetime="item.createdAt">{{ new Date(item.createdAt).toLocaleString('zh-CN') }}</time>
            <p>来源任务：<router-link v-if="item.taskId" :to="{ path: `/workbench/${applicationId}`, query: { taskId: item.taskId } }">{{ item.taskId }}</router-link><span v-else>未提供来源任务</span></p>
            <p v-if="item.status === 'FAILED'" class="version-error">错误摘要：{{ item.errorSummary || '服务端未提供错误摘要。' }}</p>
            <button type="button" class="button-secondary" :aria-pressed="selected?.id === item.id" @click="select(item)">{{ item.status === 'VERIFIED' ? '查看源码并预览' : '查看源码' }}</button>
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
.versions-panel { padding: 20px; background: white; border-top: 1px solid #e1e5ec; font-size: 13px; }
.versions-heading, nav { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 12px; }
h2 { font-size: 15px; margin: 0; }
ul { list-style: none; padding: 0; margin: 12px 0; }
li { padding: 14px 0; border-bottom: 1px solid #e1e5ec; overflow-wrap: anywhere; }
time { display: block; margin-top: 8px; color: #687384; }
.version-error { color: #8b4d18; white-space: pre-wrap; }
nav { justify-content: flex-start; }
</style>
