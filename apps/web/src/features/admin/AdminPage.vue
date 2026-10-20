<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import BrandLogo from '../../components/BrandLogo.vue'
import { ApiError } from '../../api/http'
import { clearSession, session } from '../auth/session'
import AdminTable from './AdminTable.vue'
import AdminMetrics from './AdminMetrics.vue'
import { cancelTask, cancellable, getMetrics, listRecords, query, resources, type AdminRecord, type Filters, type Metrics, type Resource } from './admin-api'

const router = useRouter()
const labels: Record<Resource, string> = { tasks: '任务', applications: '应用', deployments: '部署', users: '用户', 'model-calls': '模型调用', audit: '取消审计' }
const statuses: Record<Resource, string[]> = { tasks: ['PLAN', 'GENERATE', 'VERIFY', 'REPAIR', 'READY', 'FAILED'],
  applications: ['ACTIVE', 'ARCHIVED'], deployments: ['REQUESTED', 'PUBLISHED', 'FAILED'],
  users: ['ACTIVE', 'DISABLED'], 'model-calls': ['REQUESTED', 'SUCCEEDED', 'FAILED'], audit: ['CANCELLED', 'ALREADY_TERMINAL', 'NOT_FOUND', 'FAILED', 'UNKNOWN'] }
const empty = (): Filters => ({ status: '', ownerId: '', from: '', to: '' })
const resource = ref<Resource>('tasks'), draft = ref(empty()), applied = ref(empty())
const page = ref(0), size = ref(20), total = ref(0), rows = ref<AdminRecord[]>([])
const loading = ref(false), listError = ref(''), metricsError = ref(''), filterError = ref('')
const metrics = ref<Metrics | null>(null), loadedAt = ref('')
const target = ref<AdminRecord | null>(null), dialog = ref<HTMLDialogElement | null>(null)
const reason = ref(''), submitting = ref(false), feedback = ref(''), feedbackError = ref(false)
const blocked = ref<string[]>([])
const permitted = computed(() => session.status === 'authenticated' && session.user?.role === 'ADMIN')
const identity = computed(() => `${session.status}:${session.user?.id}:${session.user?.role}`)
const storageKey = () => `codeless.admin.cancel.v1:${session.user?.id}`
let epoch = 0
function restoreBlocked() {
  try {
    const value: unknown = JSON.parse(sessionStorage.getItem(storageKey()) ?? '[]')
    blocked.value = Array.isArray(value) && value.every(id => typeof id === 'string') ? value : []
  } catch { blocked.value = [] }
}
function block(id: string) {
  blocked.value = [...new Set([...blocked.value, id])]
  // Persist before POST. If persistence fails, do not submit an unrecoverable intent.
  sessionStorage.setItem(storageKey(), JSON.stringify(blocked.value))
}
function purge() {
  epoch++; rows.value = []; metrics.value = null; total.value = 0; target.value = null
  loading.value = false; feedback.value = ''; listError.value = ''; metricsError.value = ''; loadedAt.value = ''; blocked.value = []
}
async function authorizationError(error: unknown) {
  if (!(error instanceof ApiError) || !['unauthorized', 'forbidden'].includes(error.kind)) return false
  purge()
  if (error.kind === 'unauthorized') { clearSession(); await router.replace({ path: '/login', query: { redirect: '/admin', reason: 'required' } }) }
  else await router.replace({ path: '/apps', query: { reason: 'admin-required' } })
  return true
}
async function load() {
  if (!permitted.value) return
  const requestEpoch = ++epoch
  const currentIdentity = identity.value
  loading.value = true; listError.value = ''; metricsError.value = ''; rows.value = []; metrics.value = null; loadedAt.value = ''; total.value = 0
  const current = () => requestEpoch === epoch && currentIdentity === identity.value && permitted.value
  const table = listRecords(resource.value, applied.value, page.value, size.value).then(result => {
    if (!current()) return
    rows.value = result.items; total.value = result.total; loadedAt.value = new Date().toLocaleString()
  }).catch(async error => { if (current() && !(await authorizationError(error))) listError.value = error instanceof Error ? error.message : '记录加载失败。' })
  const overview = getMetrics(applied.value).then(result => { if (current()) metrics.value = result })
    .catch(async error => { if (current() && !(await authorizationError(error))) metricsError.value = error instanceof Error ? error.message : '指标加载失败。' })
  await Promise.allSettled([table, overview])
  if (current()) loading.value = false
}
function apply() {
  filterError.value = ''
  try { draft.value.ownerId = draft.value.ownerId.trim(); query(draft.value, true, resource.value); query(draft.value, false) }
  catch (error) { filterError.value = error instanceof Error ? error.message : '筛选条件无效。'; return }
  applied.value = { ...draft.value }; page.value = 0; void load()
}
function switchResource(value: Resource) {
  if (resource.value === value || submitting.value) return
  resource.value = value
  for (const filters of [draft.value, applied.value]) {
    filters.status = ''; filters.outcome = ''; filters.usage = ''; filters.q = ''; filters.targetId = ''
    if (!['tasks', 'applications'].includes(value)) filters.ownerId = ''
  }
  page.value = 0; void load()
}
async function openCancel(row: AdminRecord) {
  if (!permitted.value || !cancellable(row) || blocked.value.includes(row.id) || submitting.value) return
  target.value = { ...row }; reason.value = ''; await nextTick(); dialog.value?.showModal()
}
function closeCancel() { if (!submitting.value) { dialog.value?.close(); target.value = null } }
async function confirmCancel() {
  if (submitting.value || !target.value || !reason.value.trim() || !permitted.value) return
  const selected = { ...target.value }, currentIdentity = identity.value
  submitting.value = true; feedback.value = ''; feedbackError.value = false
  try {
    block(selected.id)
    const result = await cancelTask(selected.id, reason.value)
    if (currentIdentity !== identity.value || !permitted.value) return
    const outcome = result.audit.outcome
    feedbackError.value = !['CANCELLED', 'ALREADY_TERMINAL'].includes(outcome)
    rows.value = rows.value.map(row => row.id === selected.id ? result.task : row)
    feedback.value = `任务 ${selected.id}：${outcome === 'CANCELLED' ? '服务端确认已取消（FAILED / CANCELLED）' : outcome === 'ALREADY_TERMINAL' ? '任务已经终止，本次没有重复取消' : '取消审计结果未知或失败，勿重复提交，请核对审计'}。审计 ID：${result.audit.id}；结果：${outcome}。`
  } catch (error) {
    if (currentIdentity !== identity.value || !permitted.value || await authorizationError(error)) return
    feedbackError.value = true
    feedback.value = `任务 ${selected.id} 取消未获确认，结果未知，请核对后台审计，勿重复提交。${error instanceof Error ? error.message : '操作失败。'}`
  } finally {
    submitting.value = false; dialog.value?.close(); target.value = null
  }
}
watch(identity, () => { purge(); if (!permitted.value) void router.replace('/apps'); else { restoreBlocked(); void load() } }, { flush: 'sync' })
onMounted(() => { restoreBlocked(); void load() })
onUnmounted(() => { epoch++ })
</script>

<template>
  <div v-if="permitted" class="admin-page">
    <header class="admin-header"><router-link to="/apps" aria-label="CodeLess 返回我的应用"><BrandLogo /></router-link><span>基础运营后台</span><router-link to="/apps" class="button-secondary">返回我的应用</router-link></header>
    <main>
      <div class="page-heading"><div><p class="eyebrow">OPERATIONS</p><h1>运行概览</h1><p>查看平台记录，核对结果，并管理仍在执行的任务。</p></div><button class="button-secondary" type="button" :disabled="loading || submitting" @click="load">{{ loading ? '正在刷新…' : '刷新数据' }}</button></div>
      <section class="filters" aria-label="管理筛选">
        <form @submit.prevent="apply">
          <label v-if="['tasks', 'applications'].includes(resource)">所有者 ID<input v-model="draft.ownerId" placeholder="全部所有者" :disabled="submitting" /></label>
          <label>开始时间（本地，含）<input v-model="draft.from" type="datetime-local" :disabled="submitting" /></label>
          <label>结束时间（本地，不含）<input v-model="draft.to" type="datetime-local" :disabled="submitting" /></label>
          <label>记录状态<select v-model="draft.status" aria-label="记录状态" :disabled="submitting || !statuses[resource].length"><option value="">全部状态</option><option v-for="status in statuses[resource]" :key="status" :value="status">{{ status }}</option></select></label>
          <label v-if="resource === 'tasks'">任务结果<select v-model="draft.outcome" aria-label="任务结果" :disabled="submitting"><option value="">全部结果</option><option v-for="outcome in ['ACTIVE', 'READY', 'FAILED', 'CANCELLED']" :key="outcome">{{ outcome }}</option></select></label>
          <label v-if="resource === 'model-calls'">用量状态<select v-model="draft.usage" aria-label="用量状态" :disabled="submitting"><option value="">全部用量</option><option v-for="usage in ['KNOWN', 'UNKNOWN', 'PENDING']" :key="usage">{{ usage }}</option></select></label>
          <label v-if="resource === 'users'">邮箱或显示名<input v-model="draft.q" maxlength="100" :disabled="submitting" /></label>
          <label v-if="resource === 'audit'">审计目标 ID<input v-model="draft.targetId" placeholder="全部任务" :disabled="submitting" /></label>
          <label>每页条数<select v-model="size" :disabled="submitting || loading" @change="page = 0; load()"><option :value="10">10</option><option :value="20">20</option><option :value="50">50</option></select></label>
          <button class="button-primary" :disabled="submitting" type="submit">应用筛选</button>
        </form>
        <p v-if="filterError" role="alert">{{ filterError }}</p>
        <p class="active-filters">已应用：所有者 {{ applied.ownerId || '全部' }}；开始 {{ applied.from || '不限' }}；结束 {{ applied.to || '不限' }}；表格状态 {{ applied.status || '全部' }}；任务结果 {{ applied.outcome || '全部' }}；用量 {{ applied.usage || '全部' }}；搜索 {{ applied.q || '不限' }}；审计目标 {{ applied.targetId || '全部' }}。按创建时间降序，ID 降序。</p>
        <p class="active-filters">指标仅按时间窗口统计。时间筛选也适用于任务、部署、模型调用列表；用户、应用、审计列表不支持时间筛选。所有者筛选仅适用于任务和应用。</p>
      </section>
      <p v-if="loading" role="status">正在读取后台记录与指标…</p>
      <p v-if="metricsError" role="alert" class="error">指标不可用：{{ metricsError }}</p>
      <AdminMetrics v-if="metrics" :metrics="metrics" :filters="applied" @authorization-error="authorizationError" />
      <nav class="resource-nav" aria-label="管理资源"><button v-for="value in resources" :key="value" :aria-pressed="resource === value" :disabled="submitting" type="button" @click="switchResource(value)">{{ labels[value] }}</button></nav>
      <section :aria-label="`${labels[resource]}列表`">
        <div class="section-title"><h2>{{ labels[resource] }}记录</h2><span>{{ loadedAt ? `数据读取于 ${loadedAt}` : '尚无已确认快照' }}</span></div>
        <p v-if="feedback" :role="feedbackError ? 'alert' : 'status'" class="operation-result" :class="{ error: feedbackError }">{{ feedback }}</p>
        <p v-if="listError" role="alert" class="error">表格不可用：{{ listError }}</p>
        <AdminTable v-if="!listError" :resource="resource" :rows="rows" :busy="loading || submitting" :blocked="blocked" @cancel="openCancel" />
        <div v-if="!listError" class="pagination"><span>{{ loadedAt ? `共 ${total} 条 · 第 ${page + 1} 页` : '总数未知' }}</span><button type="button" class="button-secondary" :disabled="loading || submitting || page === 0" @click="page--; load()">上一页</button><button type="button" class="button-secondary" :disabled="loading || submitting || (page + 1) * size >= total" @click="page++; load()">下一页</button></div>
      </section>
      <p class="footnote">后台仅提供观测和必要管理。取消操作以服务端状态与审计为准；刷新前表格保留已读取状态。</p>
    </main>
    <dialog v-if="target" ref="dialog" aria-labelledby="cancel-title" @cancel.prevent="closeCancel">
      <form @submit.prevent="confirmCancel"><h2 id="cancel-title">确认取消任务</h2><p>任务 ID：<strong>{{ target.id }}</strong></p><p>应用 ID：{{ target.applicationId || '未知' }}</p><p>读取时状态：{{ target.status }}。服务端会再次检查目标状态；已完成的任务不可取消。</p><label>取消理由（1–200 字）<textarea v-model="reason" required maxlength="200" rows="3" :disabled="submitting" /></label><p>提交后不会自动重试。未获确认时，需要核对后台审计。</p><div class="dialog-actions"><button class="button-secondary" type="button" :disabled="submitting" @click="closeCancel">返回</button><button class="button-primary" type="submit" :disabled="submitting || !reason.trim()">{{ submitting ? '正在提交…' : '确认取消' }}</button></div></form>
    </dialog>
  </div>
  <p v-else role="alert">需要管理员权限。</p>
</template>

<style scoped>
.admin-page { min-height: 100vh; color: var(--ink); background: #f5f6f8; }
.admin-header { display: flex; align-items: center; gap: 24px; padding: 20px 32px; background: white; border-bottom: 1px solid var(--line); }
.admin-header > span { color: #586273; font-size: 14px; }
.admin-header > a:last-child { margin-left: auto; }
main { max-width: 1480px; margin: auto; padding: 36px 32px; }
.page-heading { display: flex; justify-content: space-between; align-items: center; gap: 16px; margin-bottom: 24px; }
.eyebrow { color: #586273; font: 12px Consolas, monospace; letter-spacing: 2px; margin-bottom: 8px; }
h1 { font-size: 30px; margin-bottom: 10px; font-weight: 600; } h2 { font-size: 18px; margin: 0; }
p { font-size: 14px; color: #586273; margin-bottom: 0; }
.filters { padding: 20px; background: white; border: 1px solid var(--line); border-radius: 8px; margin-bottom: 24px; }
.filters form { display: flex; flex-wrap: wrap; gap: 16px; align-items: end; }
label { display: block; font-size: 13px; color: #4f596b; }
input, select, textarea { display: block; width: 100%; min-width: 0; border: 1px solid #a4adbc; background: white; color: var(--ink); border-radius: 5px; padding: 10px; margin-top: 8px; }
input { max-width: 230px; } .active-filters { font-size: 12px; margin-top: 16px; overflow-wrap: anywhere; }
.resource-nav { display: flex; flex-wrap: wrap; gap: 8px; margin: 28px 0 24px; padding-bottom: 12px; border-bottom: 1px solid var(--line); }
.resource-nav button { padding: 10px 18px; border-radius: 6px; font-size: 14px; color: #4f596b; min-height: 44px; }
.resource-nav [aria-pressed="true"] { color: #304bc2; background: #e8ecfc; font-weight: 600; }
.section-title { display: flex; flex-wrap: wrap; gap: 12px; align-items: baseline; justify-content: space-between; margin-bottom: 16px; }
.section-title span { font-size: 12px; color: #586273; }
.error, .filters [role="alert"] { color: #9e2e29; background: #fff0ee; border: 1px solid #e8b8b3; padding: 14px; border-radius: 6px; margin-bottom: 16px; }
.operation-result { overflow-wrap: anywhere; padding: 16px; border: 1px solid var(--line); background: white; border-radius: 6px; margin-bottom: 16px; }
.pagination { display: flex; justify-content: flex-end; flex-wrap: wrap; align-items: center; gap: 12px; margin: 20px 0; font-size: 13px; }
.footnote { border-top: 1px solid var(--line); padding-top: 20px; font-size: 12px; }
dialog { border: 1px solid var(--line); border-radius: 10px; padding: 28px; width: min(540px, calc(100% - 32px)); max-height: calc(100vh - 32px); overflow: auto; }
dialog::backdrop { background: #1f283e80; } dialog p { margin: 16px 0; overflow-wrap: anywhere; }
.dialog-actions { display: flex; justify-content: flex-end; gap: 12px; margin-top: 24px; }
@media (max-width: 760px) { .admin-header { padding: 16px; gap: 12px; flex-wrap: wrap; } .admin-header > span { display: none; } main { padding: 24px 16px; } .page-heading { align-items: start; } .filters label { width: 100%; } input { max-width: none; } }
@media (prefers-reduced-motion: reduce) { button, a { transition: none; } }
</style>
