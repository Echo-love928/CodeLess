<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue'
import { ApiError } from '../../api/http'
import { session } from '../auth/session'
import type { Version } from '../versions/version-api'
import { exportSource } from './export-api'

const props = defineProps<{ version?: Version }>()
const emit = defineEmits<{ unauthorized: [] }>()
const loading = ref(false), error = ref(''), notice = ref('')
let generation = 0, abort: AbortController | undefined
const urls = new Set<string>()
function reset() { generation++; abort?.abort(); loading.value = false; error.value = ''; notice.value = ''; for (const url of urls) URL.revokeObjectURL(url); urls.clear() }
async function download() {
  if (loading.value || !props.version) return
  const current = ++generation, version = { ...props.version }
  loading.value = true; error.value = ''; notice.value = ''; abort = new AbortController()
  try {
    const archive = await exportSource(version, abort.signal)
    if (current !== generation) return
    const url = URL.createObjectURL(archive.blob); urls.add(url)
    const link = document.createElement('a'); link.href = url; link.download = archive.filename
    document.body.appendChild(link); link.click(); link.remove()
    notice.value = `已开始下载版本 v${version.number} 的源码包。`
    setTimeout(() => { if (urls.delete(url)) URL.revokeObjectURL(url) }, 1000)
  } catch (cause) {
    if (current !== generation) return
    error.value = cause instanceof Error ? cause.message : '源码下载失败。'
    if (cause instanceof ApiError && cause.status === 401) emit('unauthorized')
  } finally { if (current === generation) loading.value = false }
}
watch(() => [props.version?.id, props.version?.sourceDigest, session.user?.id, session.status], reset)
onBeforeUnmount(reset)
</script>

<template>
  <div class="source-download">
    <button type="button" class="button-secondary" :disabled="!version || loading" @click="download">{{ loading ? '正在校验源码包…' : version ? `下载源码 · v${version.number}` : '下载源码' }}</button>
    <p v-if="version" class="download-binding">下载版本：{{ version.id }}<br>源码摘要：{{ version.sourceDigest }}</p>
    <p v-if="error" role="alert">{{ error }}</p><p v-if="notice" role="status">{{ notice }}</p>
  </div>
</template>

<style scoped>
.source-download { margin: 16px 0; overflow-wrap: anywhere; }
button { min-height: 44px; }
.download-binding { font-size: 12px; line-height: 1.5; }
</style>
