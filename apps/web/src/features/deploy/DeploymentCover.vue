<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue'
import { ApiError } from '../../api/http'
import { session } from '../auth/session'
import type { Publication } from './deploy-api'
import { getCover, type Cover } from './cover-api'

const props = defineProps<{ publication: Publication }>()
const emit = defineEmits<{ unauthorized: [] }>()
const cover = ref<Cover>(), loading = ref(false), unavailable = ref(false)
let generation = 0, abort: AbortController | undefined
async function load() {
  const current = ++generation
  abort?.abort(); abort = new AbortController()
  cover.value = undefined; unavailable.value = false; loading.value = true
  try { const value = await getCover(props.publication, abort.signal); if (current === generation) cover.value = value }
  catch (cause) {
    if (current !== generation) return
    unavailable.value = true
    if (cause instanceof ApiError && cause.status === 401) emit('unauthorized')
  } finally { if (current === generation) loading.value = false }
}
watch(() => [props.publication.id, session.user?.id, session.status], () => { void load() }, { immediate: true })
onBeforeUnmount(() => { generation++; abort?.abort() })
</script>

<template>
  <div class="deployment-cover" :aria-busy="loading">
    <img v-if="cover?.status === 'SUCCEEDED' && !unavailable"
      :src="`/api/v0/publications/${publication.id}/cover/image?digest=${cover.imageDigest}`"
      width="1280" height="720" alt="已发布版本的应用封面" @error="unavailable = true">
    <div v-else class="cover-placeholder" role="img" aria-label="应用封面占位图"><span>CodeLess</span><span>已发布应用</span></div>
    <p role="status">{{ loading ? '正在读取封面…' : unavailable || cover?.status === 'FAILED' ? '封面暂不可用，网站仍已发布。' : cover?.status === 'SUCCEEDED' ? '封面已生成' : '封面排队或生成中，网站仍可访问。' }}</p>
    <button type="button" class="button-secondary" :disabled="loading" @click="load">刷新封面</button>
  </div>
</template>

<style scoped>
.deployment-cover { margin: 16px 0; }
img, .cover-placeholder { width: 100%; height: auto; aspect-ratio: 16 / 9; border-radius: 8px; border: 1px solid var(--line); object-fit: cover; }
.cover-placeholder { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; color: var(--ink); background: var(--canvas, #f7f8fa); }
.cover-placeholder span:first-child { font-size: 24px; font-weight: 600; }
p { font-size: 14px; line-height: 1.5; }
button { min-height: 44px; }
</style>
