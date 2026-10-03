<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue'
import { ApiError } from '../../api/http'
import { getPreviewCredential, type PreviewCredential } from './preview-api'

const props = defineProps<{ applicationId: string; versionId?: string | null; buildFailed?: boolean; refreshVersion?: () => Promise<void> }>()
const emit = defineEmits<{ unauthorized: [] }>()
const frame = ref<HTMLIFrameElement>()
const credential = ref<PreviewCredential | null>(null)
const state = ref<'empty' | 'loading' | 'ready' | 'expired' | 'error'>('empty')
const error = ref('')
let generation = 0
let abort: AbortController | undefined
let expiry: ReturnType<typeof setTimeout> | undefined
let loadTimeout: ReturnType<typeof setTimeout> | undefined

function dispose() {
  generation++; abort?.abort()
  clearTimeout(expiry); clearTimeout(loadTimeout)
  credential.value = null
}
async function load() {
  dispose()
  const current = generation
  error.value = ''
  if (!props.versionId) { state.value = 'empty'; return }
  state.value = 'loading'
  abort = new AbortController()
  try {
    const value = await getPreviewCredential(props.applicationId, props.versionId, abort.signal)
    if (current !== generation) return
    credential.value = value
    expiry = setTimeout(() => {
      if (current !== generation) return
      credential.value = null; state.value = 'expired'
    }, Math.max(0, Date.parse(value.expiresAt) - Date.now()))
    loadTimeout = setTimeout(() => {
      if (current !== generation || state.value !== 'loading') return
      credential.value = null; state.value = 'error'
      error.value = '页面未能在时限内加载，请刷新预览。'
    }, 15_000)
  } catch (cause) {
    if (current !== generation) return
    state.value = 'error'
    error.value = cause instanceof ApiError && cause.status === 409
      ? '该版本尚未通过构建与验证。'
      : cause instanceof ApiError && cause.status === 503
        ? '预览服务尚未配置或产物暂不可用。'
        : cause instanceof Error ? cause.message : '预览加载失败。'
    if (cause instanceof ApiError && cause.status === 401) emit('unauthorized')
  }
}
function message(event: MessageEvent) {
  if (!credential.value || event.source !== frame.value?.contentWindow ||
      event.origin !== new URL(credential.value.url).origin || event.data?.type !== 'codeless-preview') return
  if (event.data.state === 'loaded') { clearTimeout(loadTimeout); state.value = 'ready' }
  if (event.data.state === 'unavailable') {
    clearTimeout(loadTimeout); credential.value = null; state.value = 'error'
    error.value = '预览凭据失效或产物不可用，请刷新预览。'
  }
}
async function refresh() {
  const previous = props.versionId, current = generation
  try {
    if (props.refreshVersion) { state.value = 'loading'; await props.refreshVersion() }
    if (current !== generation) return
    if (previous === props.versionId) await load()
  } catch (cause) {
    if (current !== generation) return
    dispose(); state.value = 'error'
    error.value = '无法读取当前版本，请刷新重试。'
    if (cause instanceof ApiError && cause.status === 401) emit('unauthorized')
  }
}
window.addEventListener('message', message)
watch(() => [props.applicationId, props.versionId], () => { void load() }, { immediate: true })
onBeforeUnmount(() => { dispose(); window.removeEventListener('message', message) })
</script>

<template>
  <div class="preview-panel">
    <div class="preview-panel__controls"><span v-if="versionId">版本 {{ versionId }}</span><span v-else>暂无可预览版本</span><button type="button" class="button-secondary" :disabled="state === 'loading'" @click="refresh">刷新预览</button></div>
    <p v-if="buildFailed" class="preview-panel__warning" role="status">本次生成失败。已有可用版本会继续保留。</p>
    <p v-if="state === 'empty'" class="preview-panel__message" role="status">{{ buildFailed ? '构建失败，暂无已验证版本。' : '完成生成与验证后即可预览。' }}</p>
    <p v-if="state === 'loading'" class="preview-panel__message" role="status">正在加载已验证版本…</p>
    <p v-if="state === 'expired'" class="preview-panel__message" role="status">预览访问已过期，请刷新预览。</p>
    <p v-if="state === 'error'" class="preview-panel__message" role="alert">{{ error }}</p>
    <iframe v-if="credential" ref="frame" :key="credential.url" :src="credential.url" title="当前版本预览"
      sandbox="allow-scripts allow-same-origin" referrerpolicy="no-referrer"
      allow="camera 'none'; microphone 'none'; geolocation 'none'; payment 'none'; clipboard-read 'none'; clipboard-write 'none'"
      :class="{ 'preview-panel__frame--loading': state === 'loading' }" />
  </div>
</template>

<style scoped>
.preview-panel { width: 100%; min-height: 430px; background: white; }
.preview-panel__controls { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 10px; padding: 12px 16px; border-bottom: 1px solid #e1e5ec; color: #687384; font-size: 12px; overflow-wrap: anywhere; }
.preview-panel__controls button { flex-shrink: 0; }
.preview-panel__message { padding: 56px 20px; color: #687384; text-align: center; font-size: 14px; }
.preview-panel__warning { margin: 0; padding: 12px 16px; color: #8b4d18; background: #fff5e8; font-size: 13px; }
iframe { display: block; width: 100%; height: 560px; border: 0; }
.preview-panel__frame--loading { height: 1px; visibility: hidden; }
</style>
