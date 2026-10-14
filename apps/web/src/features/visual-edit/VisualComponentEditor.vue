<script setup lang="ts">
import { computed, inject, onBeforeUnmount, ref, watch } from 'vue'
import { ApiError } from '../../api/http'
import { createComponentEdit, getMapping, selectComponent, type Candidate, type Mapping, type Selection } from '../mapping/component-api'
import { editContext, validateAccepted } from './edit-flow'

const props = defineProps<{ applicationId: string; versionId: string; candidate: Candidate | null }>()
const emit = defineEmits<{ available: [value: boolean]; unauthorized: []; accepted: [] }>()
const flow = inject(editContext, undefined)
const mapping = ref<Mapping>(), selection = ref<Selection>()
const prompt = ref(''), confirmed = ref(false), error = ref(''), submitting = ref(false)
const locked = computed(() => submitting.value || flow?.locked.value === true)
const validPrompt = computed(() => !!prompt.value.trim() && Array.from(prompt.value.trim()).length <= 8000)
let generation = 0, selectionGeneration = 0, key = crypto.randomUUID(), signature = ''
let abort: AbortController | undefined, selectionAbort: AbortController | undefined
function report(cause: unknown) {
  error.value = cause instanceof ApiError && cause.status === 409
    ? '版本已变化、存在进行中的任务或映射不可用。请查看当前版本并重新选择；你的描述已保留。'
    : cause instanceof Error ? cause.message : '组件映射不可用。'
  if (cause instanceof ApiError && cause.status === 401) emit('unauthorized')
}
watch(() => [props.applicationId, props.versionId], async () => {
  const current = ++generation; selectionGeneration++; abort?.abort(); selectionAbort?.abort()
  abort = new AbortController(); mapping.value = undefined; selection.value = undefined; confirmed.value = false; error.value = ''
  emit('available', false)
  try {
    const value = await getMapping(props.versionId, abort.signal)
    if (current !== generation) return
    mapping.value = value; emit('available', value.components.length > 0)
  } catch (cause) { if (current === generation) report(cause) }
}, { immediate: true })
watch(() => [props.candidate, mapping.value] as const, async ([candidate, currentMapping]) => {
  const current = ++selectionGeneration; selectionAbort?.abort(); selectionAbort = new AbortController()
  selection.value = undefined; confirmed.value = false
  if (!currentMapping || !candidate || locked.value) return
  try {
    const value = await selectComponent(currentMapping, candidate, selectionAbort.signal)
    if (current !== selectionGeneration) return
    selection.value = value; error.value = ''
  } catch (cause) { if (current === selectionGeneration) report(cause) }
})
async function submit() {
  if (!flow || !selection.value?.selectable || !validPrompt.value || !confirmed.value || locked.value) return
  const current = generation, target = selection.value, text = prompt.value.trim()
  const nextSignature = JSON.stringify([props.applicationId, target.versionId, target.sourceDigest, target.componentId, text])
  if (nextSignature !== signature) { key = crypto.randomUUID(); signature = nextSignature }
  submitting.value = true; error.value = ''
  flow.posting.value = true
  try {
    const result = validateAccepted(await createComponentEdit(props.applicationId, target, text, key), target.versionId)
    if (current !== generation) return
    flow.accept(result, text, target.componentId!); emit('accepted')
  } catch (cause) { if (current === generation) report(cause) }
  finally { flow.posting.value = false; if (current === generation) submitting.value = false }
}
onBeforeUnmount(() => { generation++; selectionGeneration++; abort?.abort(); selectionAbort?.abort() })
</script>

<template>
  <section class="component-editor" aria-label="组件修改" :aria-busy="submitting">
    <p v-if="error" role="alert">{{ error }}</p>
    <p v-if="mapping && !mapping.components.length" role="status">此版本没有可选择的组件。</p>
    <ul v-if="mapping?.disabled.length"><li v-for="file in mapping.disabled" :key="file.sourceFile">{{ file.sourceFile }}：{{ file.reason }}</li></ul>
    <p v-if="selection && !selection.selectable" role="status">不能选择该组件：{{ selection.reason }}</p>
    <template v-if="selection?.selectable">
      <p>已选组件：{{ selection.componentId }} · {{ selection.sourceFile }}</p>
      <p>基版本：{{ selection.versionId }}</p>
      <p role="status">{{ selection.notice }} 修改作用于整个源码组件及所有实例，包括其他页面的共享实例。</p>
      <label>组件修改描述<textarea v-model="prompt" maxlength="16000" :disabled="locked" aria-describedby="component-edit-hint" /></label>
      <p id="component-edit-hint">可描述文案、颜色或间距的修改；最多 8000 个字符。</p>
      <label class="confirm"><input v-model="confirmed" type="checkbox" :disabled="locked" />我确认修改影响整个源码组件及所有共享实例</label>
      <p v-if="!flow" role="alert">修改任务入口不可用，请返回版本工作台。</p>
      <button class="button-primary" type="button" :disabled="!flow || locked || !confirmed || !validPrompt" @click="submit">{{ submitting ? '正在创建修改任务…' : '创建组件修改' }}</button>
    </template>
  </section>
</template>

<style scoped>
.component-editor { padding: 12px 0; font-size: 13px; border-top: 1px solid #e1e5ec; overflow-wrap: anywhere; }
.component-editor:empty { display: none; }
label { display: grid; gap: 6px; margin-bottom: 10px; }
textarea { width: 100%; min-height: 88px; padding: 8px; border: 1px solid #ccd3df; border-radius: 6px; font: inherit; }
.confirm { display: flex; align-items: flex-start; gap: 8px; line-height: 1.6; min-height: 44px; }
.confirm input { margin-top: 4px; flex-shrink: 0; }
button { min-height: 44px; }
ul { padding-left: 20px; color: #8b4d18; }
</style>
