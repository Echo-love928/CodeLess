<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { ApiError } from '../../api/http'
import { createComponentEdit, getMapping, selectComponent, type Candidate, type Mapping, type Selection } from './component-api'

const props = defineProps<{ applicationId: string; versionId?: string | null; candidate?: Candidate | null }>()
const emit = defineEmits<{ available: [value: boolean]; unauthorized: [] }>()
const router = useRouter()
const mapping = ref<Mapping>()
const selection = ref<Selection>()
const prompt = ref('')
const error = ref('')
const submitting = ref(false)
let generation = 0, selectionGeneration = 0
let abort: AbortController | undefined
let selectionAbort: AbortController | undefined
let key = crypto.randomUUID()
function report(cause: unknown) {
  error.value = cause instanceof ApiError && cause.status === 409 ? '版本已变化、存在进行中的任务或映射不可用。请查看当前版本后重新提交；你的描述已保留。'
    : cause instanceof Error ? cause.message : '组件映射不可用。'
  if (cause instanceof ApiError && cause.status === 401) emit('unauthorized')
}
watch(() => [props.applicationId, props.versionId], async () => {
  const current = ++generation; selectionGeneration++; abort?.abort(); selectionAbort?.abort()
  abort = new AbortController(); mapping.value = undefined; selection.value = undefined; error.value = ''; emit('available', false)
  if (!props.versionId) return
  try {
    const value = await getMapping(props.versionId, abort.signal)
    if (current !== generation) return
    mapping.value = value; emit('available', value.components.length > 0)
  } catch (cause) { if (current === generation) report(cause) }
}, { immediate: true })
watch(() => props.candidate, async candidate => {
  const current = ++selectionGeneration; selectionAbort?.abort(); selectionAbort = new AbortController(); selection.value = undefined
  if (!mapping.value || !candidate) return
  try {
    const value = await selectComponent(mapping.value, candidate, selectionAbort.signal)
    if (current !== selectionGeneration) return
    selection.value = value; key = crypto.randomUUID(); error.value = ''
  } catch (cause) { if (current === selectionGeneration) report(cause) }
})
async function submit() {
  if (!selection.value?.selectable || !prompt.value.trim() || submitting.value) return
  submitting.value = true; error.value = ''
  const current = generation, app = props.applicationId
  try {
    const result = await createComponentEdit(app, selection.value, prompt.value.trim(), key)
    if (current === generation) await router.push({ path: `/workbench/${app}`, query: { taskId: result.task.id } })
  } catch (cause) { if (current === generation) report(cause) }
  finally { submitting.value = false }
}
watch(prompt, () => { key = crypto.randomUUID() })
onBeforeUnmount(() => { generation++; selectionGeneration++; abort?.abort(); selectionAbort?.abort() })
</script>

<template>
  <section class="component-editor" aria-label="组件修改">
    <p v-if="error" role="alert">{{ error }}</p>
    <p v-if="mapping && !mapping.components.length" role="status">此版本没有可选择的组件。</p>
    <ul v-if="mapping?.disabled.length"><li v-for="file in mapping.disabled" :key="file.sourceFile">{{ file.sourceFile }}：{{ file.reason }}</li></ul>
    <p v-if="selection && !selection.selectable" role="status">不能选择该组件：{{ selection.reason }}</p>
    <template v-if="selection?.selectable">
      <p>已选组件：{{ selection.componentId }} · {{ selection.sourceFile }}</p>
      <p role="status">{{ selection.notice }}</p>
      <label>组件修改描述<textarea v-model="prompt" maxlength="8000" :disabled="submitting" /></label>
      <button class="button-primary" type="button" :disabled="submitting || !prompt.trim()" @click="submit">{{ submitting ? '正在创建修改任务…' : '创建组件修改' }}</button>
    </template>
  </section>
</template>

<style scoped>
.component-editor { padding: 12px 16px; font-size: 13px; border-top: 1px solid #e1e5ec; overflow-wrap: anywhere; }
.component-editor:empty { display: none; }
label { display: grid; gap: 6px; margin-bottom: 10px; }
textarea { min-height: 72px; padding: 8px; border: 1px solid #ccd3df; border-radius: 6px; font: inherit; }
ul { padding-left: 20px; color: #8b4d18; }
</style>
