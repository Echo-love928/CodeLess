<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { ApiError } from '../../api/http'
import type { Version } from '../versions/version-api'
import { getSource, type SourceSnapshot } from './source-api'

const props = defineProps<{ version?: Version }>()
const emit = defineEmits<{ unauthorized: [] }>()
const snapshot = ref<SourceSnapshot>()
const path = ref('')
const loading = ref(false)
const error = ref('')
const currentFile = computed(() => snapshot.value?.files.find(file => file.path === path.value))
let generation = 0
let abort: AbortController | undefined
async function load() {
  const current = ++generation
  abort?.abort()
  snapshot.value = undefined; path.value = ''; error.value = ''; loading.value = false
  if (!props.version) return
  loading.value = true
  abort = new AbortController()
  try {
    const value = await getSource(props.version, abort.signal)
    if (current !== generation) return
    snapshot.value = value; path.value = value.files[0]?.path ?? ''
  } catch (cause) {
    if (current !== generation) return
    error.value = cause instanceof ApiError && cause.status === 404
      ? '该版本暂无可读取源码快照，或源码接口尚未接入。'
      : cause instanceof Error ? cause.message : '源码读取失败，请重试。'
    if (cause instanceof ApiError && cause.status === 401) emit('unauthorized')
  } finally { if (current === generation) loading.value = false }
}
watch(() => props.version, () => { void load() }, { immediate: true })
onBeforeUnmount(() => { generation++; abort?.abort() })
</script>

<template>
  <section class="source-panel" aria-label="只读源码">
    <h2>只读源码 <small v-if="version">版本 {{ version.number }} · {{ version.id }}</small></h2>
    <p v-if="!version" role="status">选择一个版本查看源码。</p>
    <p v-else-if="loading" role="status">正在读取版本源码…</p>
    <div v-else-if="error"><p role="alert">{{ error }}</p><button type="button" class="button-secondary" @click="load">重试读取源码</button></div>
    <template v-else-if="snapshot">
      <p class="source-digest">源码摘要：{{ snapshot.sourceDigest }}</p>
      <p v-if="!snapshot.files.length" role="status">此版本源码快照为空。</p>
      <template v-else>
        <label :for="`source-file-${version?.id}`">当前文件</label>
        <select :id="`source-file-${version?.id}`" v-model="path"><option v-for="file in snapshot.files" :key="file.path" :value="file.path">{{ file.path }}</option></select>
        <pre tabindex="0" aria-label="文件内容"><code>{{ currentFile?.content }}</code></pre>
      </template>
    </template>
  </section>
</template>

<style scoped>
.source-panel { padding: 20px; background: white; border-top: 1px solid #e1e5ec; min-width: 0; }
h2 { font-size: 15px; margin: 0 0 14px; }
small { display: block; margin-top: 8px; font-size: 12px; font-weight: normal; overflow-wrap: anywhere; }
p, label, select { font-size: 13px; }
.source-digest { overflow-wrap: anywhere; color: #687384; }
select { display: block; width: 100%; max-width: 100%; margin: 8px 0 12px; padding: 8px; }
pre { max-height: 420px; overflow: auto; padding: 16px; border: 1px solid #dbe0e9; background: #f7f8fa; font-size: 12px; line-height: 1.6; tab-size: 2; }
</style>
