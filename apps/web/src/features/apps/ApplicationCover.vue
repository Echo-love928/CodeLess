<script setup lang="ts">
import { computed, ref, watch } from 'vue'

const props = defineProps<{ applicationId: string; versionId?: string | null; name: string }>()
const failed = ref(false)
const source = computed(() => props.versionId
  ? `/api/v0/applications/${encodeURIComponent(props.applicationId)}/versions/${encodeURIComponent(props.versionId)}/cover`
  : '')
watch(() => source.value, () => { failed.value = false })
</script>

<template>
  <div class="application-cover">
    <img v-if="source && !failed" :key="source" :src="source" :alt="`${name}的页面截图`"
      width="1280" height="720" loading="lazy" decoding="async" @error="failed = true" />
    <div v-else class="cover-placeholder">
      <div class="cover-placeholder__page" aria-hidden="true"><div class="cover-placeholder__bar"><i /><i /><i /></div><div class="cover-placeholder__body"><span /><b /><span /><div><i /><i /><i /></div></div></div>
      <p>{{ versionId ? '封面暂时不可用' : '生成页面后自动显示封面' }}</p>
      <button v-if="versionId" type="button" :aria-label="`重新加载${name}的封面`" @click="failed = false">重新加载</button>
    </div>
  </div>
</template>

<style scoped>
.application-cover { width: 100%; height: 100%; overflow: hidden; background: #edf0f5; }
.application-cover > img { display: block; width: 100%; height: 100%; object-fit: cover; object-position: center top; }
.cover-placeholder { display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; gap: 12px; padding: 24px; }
.cover-placeholder p { margin: 0; color: #626d80; font-size: 13px; }
.cover-placeholder > button { min-height: 44px; padding: 8px 16px; color: var(--blue); font-size: 13px; }
.cover-placeholder__page { width: min(260px, 80%); border: 1px solid #dce1eb; border-radius: 8px; background: white; box-shadow: 0 8px 24px #29345108; }
.cover-placeholder__bar { display: flex; gap: 4px; padding: 9px; border-bottom: 1px solid #edf0f5; }
.cover-placeholder__bar i { width: 5px; height: 5px; background: #d7ddeb; border-radius: 50%; }
.cover-placeholder__body { display: grid; gap: 10px; padding: 18px; }
.cover-placeholder__body > span { width: 55%; height: 6px; background: #e6eaf3; border-radius: 3px; }
.cover-placeholder__body > b { width: 75%; height: 13px; background: #d7dff8; border-radius: 3px; }
.cover-placeholder__body > div { display: flex; gap: 7px; margin-top: 6px; }
.cover-placeholder__body > div i { flex: 1; height: 36px; border-radius: 4px; background: #f0f3f9; }
</style>
