<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, useId, watch } from 'vue'
import { ApiError } from '../../api/http'
import { session } from '../auth/session'
import { getVersion, type Version } from '../versions/version-api'
import { createPublication, getPublication, listPublications, verifiedArtifact, loadPublicOrigin, type Publication, type PublicationIntent } from './deploy-api'
import DeploymentCover from './DeploymentCover.vue'
import SourceDownload from '../source/SourceDownload.vue'
import { publicationFailureDescription, publicationUnknownDescription } from '../workbench/failure-description'

const props = defineProps<{ applicationId: string; versionId?: string | null }>()
const emit = defineEmits<{ unauthorized: [] }>()
const open = ref(false), loading = ref(false), posting = ref(false), refreshing = ref(false), recovering = ref(false)
const trigger = ref<HTMLButtonElement>()
const closeButton = ref<HTMLButtonElement>()
const panelId = useId()
const version = ref<Version>(), confirmed = ref(false), error = ref(''), notice = ref('')
const copyError = ref('')
const current = ref<Publication>(), last = ref<Publication>(), uncertain = ref(false)
const configured = ref(false)
const artifactDigest = ref(''), intent = ref<PublicationIntent>()
const locked = computed(() => posting.value || refreshing.value || recovering.value || uncertain.value || current.value?.status === 'REQUESTED')
const canPublish = computed(() => configured.value && !loading.value && !locked.value && confirmed.value &&
  !!artifactDigest.value && version.value?.status === 'VERIFIED' && version.value.id === props.versionId && session.status === 'authenticated')
let epoch = 0, versionRequest = 0
const key = () => `codeless:publication:${session.user?.id}:${props.applicationId}`
function save() {
  try { sessionStorage.setItem(key(), JSON.stringify({ uncertain: uncertain.value, intent: uncertain.value ? intent.value : undefined })) }
  catch { notice.value = '浏览器无法保存恢复记录，请保留发布编号。' }
}
function report(cause: unknown) {
  error.value = cause instanceof ApiError && cause.status === 409 ? '版本或发布请求已变化，请重新读取版本与发布记录。' : cause instanceof Error ? cause.message : '发布服务暂时不可用。'
  if (cause instanceof ApiError && cause.status === 401) emit('unauthorized')
}
function adopt(value: Publication) {
  if (current.value?.id === value.id && current.value.status !== 'REQUESTED' && value.status !== current.value.status)
    throw new Error('发布状态发生冲突，请联系维护者。')
  current.value = value; uncertain.value = false; intent.value = undefined
  if (value.status === 'PUBLISHED') { last.value = value; notice.value = '发布成功，公开地址已通过访问检查。' }
  if (value.status === 'FAILED') error.value = publicationFailureDescription
  save()
}
async function loadVersion() {
  const generation = epoch, request = ++versionRequest, id = props.versionId
  version.value = undefined; artifactDigest.value = ''; confirmed.value = false; loading.value = true
  try {
    if (id) {
      const value = await getVersion(id, props.applicationId)
      const artifact = value.status === 'VERIFIED' ? await verifiedArtifact(value) : ''
      if (epoch === generation && request === versionRequest) { version.value = value; artifactDigest.value = artifact }
    }
  } catch (cause) { if (epoch === generation && request === versionRequest) report(cause) }
  finally { if (epoch === generation && request === versionRequest) loading.value = false }
}
async function recover() {
  if (recovering.value) return
  const generation = epoch, applicationId = props.applicationId
  recovering.value = true
  try {
    // Server discovery is authoritative even with empty/disabled/corrupt browser storage.
    const page = await listPublications(applicationId)
    if (generation !== epoch) return
    last.value = page.latestSuccessful ?? undefined
    current.value = page.items[0]
    let stored: { uncertain?: boolean; intent?: PublicationIntent } = {}
    try { stored = JSON.parse(sessionStorage.getItem(key()) ?? '{}') ?? {} }
    catch { notice.value = '浏览器恢复记录不可用，已读取服务端发布记录。' }
    uncertain.value = page.uncertain === true || stored.uncertain === true
    intent.value = stored.intent?.applicationId === applicationId ? stored.intent : undefined
    if (generation === epoch && uncertain.value) error.value = '上次提交结果未知，已暂停再次发布。请联系维护者核对发布记录。'
  } catch (cause) { if (generation === epoch) { uncertain.value = true; report(cause) } }
  finally { if (generation === epoch) recovering.value = false }
}
async function publish() {
  if (!canPublish.value || !version.value) return
  intent.value = { applicationId: props.applicationId, versionId: version.value.id, artifactDigest: artifactDigest.value, key: crypto.randomUUID() }
  await submitIntent()
}
async function submitIntent() {
  if (!intent.value || posting.value) return
  const generation = epoch, binding = { ...intent.value }
  posting.value = true; uncertain.value = true; confirmed.value = false; error.value = ''; notice.value = ''; save()
  try {
    const value = await createPublication(binding)
    if (generation !== epoch) return
    adopt(value)
    // An idempotent replay may return an old terminal publication. Reconcile
    // the independent server pointer instead of leaving that old URL as latest.
    const page = await listPublications(binding.applicationId)
    if (generation === epoch) { last.value = page.latestSuccessful ?? last.value; uncertain.value = page.uncertain === true; save() }
  } catch (cause) {
    if (generation === epoch) {
      // A definite rejection is retryable; a lost POST response must not automatically duplicate a deployment.
      if (cause instanceof ApiError && [400, 401, 403, 409, 429].includes(cause.status ?? 0) ||
        cause instanceof Error && cause.message.includes('尚未通过验证')) uncertain.value = false
      report(cause); save()
    }
  } finally { if (generation === epoch) posting.value = false }
}
async function refresh() {
  if (!current.value || refreshing.value) return
  const generation = epoch, id = current.value.id, applicationId = props.applicationId, versionId = current.value.versionId
  refreshing.value = true; error.value = ''
  try {
    const value = await getPublication(id, applicationId, versionId)
    if (generation === epoch) adopt(value)
    const page = await listPublications(applicationId)
    if (generation === epoch) { last.value = page.latestSuccessful ?? undefined; uncertain.value = page.uncertain === true; save() }
  } catch (cause) { if (generation === epoch) report(cause) }
  finally { if (generation === epoch) refreshing.value = false }
}
async function copy() {
  if (!last.value?.url) return
  const generation = epoch
  copyError.value = ''
  try { await navigator.clipboard.writeText(last.value.url); if (generation === epoch) notice.value = '公开地址已复制。' }
  catch { if (generation === epoch) copyError.value = '复制失败，请选中下方地址手动复制。' }
}
function close() { open.value = false; trigger.value?.focus() }
async function reload() {
  if (loading.value || posting.value || refreshing.value || recovering.value) return
  const generation = epoch
  loading.value = true; error.value = ''
  try {
    await loadPublicOrigin()
    if (generation !== epoch) return
    configured.value = true
    await recover()
    if (generation === epoch) await loadVersion()
  } catch (cause) { if (generation === epoch) report(cause) }
  finally { if (generation === epoch) loading.value = false }
}
watch(() => [props.applicationId, session.user?.id], () => {
  epoch++; current.value = undefined; last.value = undefined; version.value = undefined; artifactDigest.value = ''; intent.value = undefined
  posting.value = false; refreshing.value = false; recovering.value = false; uncertain.value = false; error.value = ''; notice.value = ''; copyError.value = ''; open.value = false
  configured.value = false
  const generation = epoch
  void loadPublicOrigin().then(() => {
    if (generation !== epoch) return
    configured.value = true; void recover()
  }).catch(cause => { if (generation === epoch) { configured.value = false; report(cause) } })
}, { immediate: true })
watch(() => props.versionId, () => { version.value = undefined; artifactDigest.value = ''; confirmed.value = false; if (open.value) void loadVersion() })
watch(open, value => {
  if (!value) return
  void loadVersion()
  void nextTick(() => { if (open.value) closeButton.value?.focus() })
})
onBeforeUnmount(() => { epoch++; versionRequest++ })
</script>

<template>
  <div class="deploy-control">
    <button ref="trigger" type="button" class="button-primary" :aria-expanded="open" :aria-controls="open ? panelId : undefined" @click="open = !open">发布</button>
    <section v-if="open" :id="panelId" class="deploy-panel" aria-label="发布面板" @keydown.esc.stop.prevent="close">
      <div class="deploy-heading"><h2>发布应用</h2><button ref="closeButton" type="button" aria-label="关闭发布面板" @click="close">关闭</button></div>
      <p>确认后，此版本会拥有独立的公开地址。</p>
      <p v-if="!configured" role="alert">公开站点尚未配置，暂时无法发布。</p>
      <p v-if="loading" role="status">正在核对待发布版本…</p>
      <p v-else-if="version">待发布版本：v{{ version.number }} · {{ version.status === 'VERIFIED' ? '已验证' : '未通过验证' }}<code>{{ version.id }}</code><code>{{ version.sourceDigest }}</code></p>
      <p v-else>暂无可发布的已验证版本。</p>
      <p v-if="artifactDigest">构建产物：<code>{{ artifactDigest }}</code></p>
      <SourceDownload :version="version" @unauthorized="emit('unauthorized')" />
      <p v-if="version && last && version.id !== last.versionId">当前选定版本与分享版本不同。分享地址对应下方成功发布版本；源码下载对应上方选定版本。</p>
      <label class="deploy-confirm"><input v-model="confirmed" type="checkbox" :disabled="!version || version.status !== 'VERIFIED' || locked">我确认公开发布上方版本</label>
      <button type="button" class="button-primary" :disabled="!canPublish" @click="publish">{{ posting ? '正在提交发布…' : '确认发布' }}</button>
      <p v-if="current">本次发布：{{ current.id }}<br>版本：{{ current.versionId }}<br>状态：{{ { REQUESTED: '已受理，正在部署与检查', PUBLISHED: '发布成功', FAILED: '发布失败' }[current.status] }}</p>
      <p v-if="current?.status === 'FAILED'" role="status">{{ publicationFailureDescription }}再次确认将创建新的发布记录。</p>
      <button type="button" class="button-secondary" :disabled="loading || posting || refreshing || recovering" @click="reload">重新读取版本与发布记录</button>
      <button v-if="current" type="button" class="button-secondary" :disabled="refreshing" @click="refresh">刷新发布状态</button>
      <button v-else-if="uncertain" type="button" class="button-secondary" :disabled="recovering" @click="recover">重新读取发布记录</button>
      <p v-if="uncertain && intent">本次待核对版本：<code>{{ intent.versionId }}</code><code>{{ intent.artifactDigest }}</code></p>
      <button v-if="uncertain && intent" type="button" class="button-secondary" :disabled="posting || recovering" @click="submitIntent">重试本次提交</button>
      <p v-if="uncertain" role="status">{{ publicationUnknownDescription }}</p>
      <p v-if="error" role="alert">{{ error }}</p><p v-if="notice" role="status">{{ notice }}</p>
      <p v-if="copyError" role="alert">{{ copyError }}</p>
      <div v-if="last" class="deploy-success"><h3>上次成功发布</h3><p>分享版本：{{ last.versionId }}<br>部署编号：{{ last.id }}<br>发布时间：{{ last.publishedAt }}</p><DeploymentCover :key="last.id" :publication="last" @unauthorized="emit('unauthorized')" /><a :href="last.url ?? undefined" target="_blank" rel="noopener noreferrer">{{ last.url }}</a><button type="button" class="button-secondary" @click="copy">复制公开地址</button></div>
    </section>
  </div>
</template>

<style scoped>
.deploy-control { position: relative; }
.deploy-panel { position: absolute; top: calc(100% + 12px); right: 0; z-index: 40; width: min(440px, calc(100vw - 32px)); max-height: calc(100dvh - 100px); overflow-y: auto; padding: 24px; border: 1px solid var(--line); border-radius: 10px; background: white; color: var(--ink); box-shadow: 0 12px 40px #22293626; font-size: 14px; overflow-wrap: anywhere; }
.deploy-heading { display: flex; justify-content: space-between; align-items: center; gap: 12px; }
.deploy-heading h2 { margin: 0; font-size: 20px; }
.deploy-panel p { margin: 16px 0; }
.deploy-panel code { display: block; margin-top: 6px; font-size: 12px; }
.deploy-panel button { min-height: 44px; }
.deploy-panel a { display: block; text-decoration: underline; color: var(--blue); margin: 12px 0; }
.deploy-confirm { display: flex; align-items: center; gap: 10px; min-height: 44px; margin-bottom: 12px; }
.deploy-success { margin-top: 24px; padding-top: 20px; border-top: 1px solid var(--line); }
.deploy-success h3 { font-size: 16px; }
</style>
