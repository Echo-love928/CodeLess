<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue'
import ComponentEditor from '../mapping/ComponentEditor.vue'
import { createSelectorSession, type Selected } from './selector-session'

const props = defineProps<{ applicationId: string; versionId: string; origin: string; frame?: HTMLIFrameElement; active: boolean }>()
const emit = defineEmits<{ unauthorized: [] }>()
const available = ref(false), connected = ref(false), selecting = ref(false)
const selected = ref<Selected | null>(null)
let session: ReturnType<typeof createSelectorSession> | undefined
function mode() { session?.mode(selecting.value) }
function message(event: MessageEvent) { session?.receive(event) }
function exit() { selecting.value = false; mode() }
function key(event: KeyboardEvent) { if (selecting.value && event.key === 'Escape') { event.preventDefault(); exit() } }
function connect() {
  session?.close(); connected.value = false; selecting.value = false; selected.value = null
  if (!props.frame?.contentWindow) return
  session = createSelectorSession({ frame: props.frame.contentWindow, origin: props.origin, versionId: props.versionId,
    onSelection: value => { selected.value = value }, onExit: () => { selecting.value = false }, onReady: () => { connected.value = true } })
  session.probe()
}
watch(() => [props.frame, props.versionId, props.origin], (_value, _old, cleanup) => {
  connect()
  const frame = props.frame
  frame?.addEventListener('load', connect)
  cleanup(() => frame?.removeEventListener('load', connect))
}, { immediate: true, flush: 'post' })
watch(() => props.active, active => { if (!active) exit() })
window.addEventListener('message', message)
window.addEventListener('keydown', key)
onBeforeUnmount(() => { session?.close(); window.removeEventListener('message', message); window.removeEventListener('keydown', key) })
</script>

<template>
  <section v-if="active" class="visual-selector" aria-label="预览组件选择">
    <label><input v-model="selecting" type="checkbox" :disabled="!available || !connected" @change="mode" />选择组件进行修改</label>
    <p v-if="selecting">悬停查看范围，点击选择组件。按 Esc 退出编辑。</p>
    <button v-if="selected" type="button" class="button-secondary" @click="session?.clear()">取消选择</button>
    <p v-if="selected?.instance" role="status">当前点击第 {{ selected.instance.index }} / {{ selected.instance.count }} 个已渲染实例。修改影响整个源码组件及所有共享实例，包括其他页面的实例。</p>
    <ComponentEditor :application-id="applicationId" :version-id="versionId" :candidate="selected?.candidate ?? null"
      @available="available = $event" @unauthorized="emit('unauthorized')" />
  </section>
</template>

<style scoped>
.visual-selector { padding: 10px 16px; font-size: 13px; }
p { color: #536176; }
</style>
