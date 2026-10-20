<script setup lang="ts">
import { computed, onUnmounted, ref } from 'vue'
import { getGenerationTrend, successRate, type Filters, type Metrics, type Outcomes } from './admin-api'
import { session } from '../auth/session'
import { ApiError } from '../../api/http'
const props = defineProps<{ metrics: Metrics; filters: Filters }>()
const emit = defineEmits<{ 'authorization-error': [error: unknown] }>()
const trend = ref<Metrics['trend']>([]), loading = ref(false), error = ref('')
let alive = true
onUnmounted(() => { alive = false })
async function expand(event: Event) {
  if (!(event.target as HTMLDetailsElement).open || loading.value || trend.value.length) return
  const identity = session.user?.id
  loading.value = true; error.value = ''
  try {
    const result = await getGenerationTrend(props.filters)
    if (alive && identity === session.user?.id && session.user?.role === 'ADMIN') trend.value = result
  } catch (cause) {
    if (alive && identity === session.user?.id) {
      if (cause instanceof ApiError && ['unauthorized', 'forbidden'].includes(cause.kind)) emit('authorization-error', cause)
      else error.value = cause instanceof Error ? cause.message : '趋势读取失败。'
    }
  }
  finally { if (alive) loading.value = false }
}
const total = (value: Outcomes) => value.succeeded + value.failed + value.pending + value.cancelled
const peak = computed(() => Math.max(1, ...trend.value.map(day => total(day.generation))))
const kinds = ['succeeded', 'failed', 'pending', 'cancelled'] as const
const labels = { succeeded: '成功', failed: '失败', pending: '进行中', cancelled: '取消' }
</script>

<template>
  <section aria-label="运营指标">
    <div class="metric-grid">
      <article v-for="(value, key) in { generation: metrics.generation, deployment: metrics.deployment }" :key="key" class="metric-card">
        <h2>{{ key === 'generation' ? '生成成功率' : '部署成功率' }}</h2><strong>{{ successRate(value) }}</strong>
        <p>成功 {{ value.succeeded }} / 失败 {{ value.failed }} · 分母 {{ value.denominator ?? value.succeeded + value.failed }}</p><p>进行中 {{ value.pending }} · 取消 {{ value.cancelled }}</p>
      </article>
      <article class="metric-card"><h2>模型用量</h2><strong>{{ metrics.usage.unknownCalls ? '部分未知' : metrics.usage.inputTokens === null || metrics.usage.outputTokens === null ? '未知' : '已知用量' }}</strong>
        <p>输入 {{ metrics.usage.inputTokens ?? '未知' }} / 输出 {{ metrics.usage.outputTokens ?? '未知' }} tokens</p><p>用量未知的调用 {{ metrics.usage.unknownCalls }} 次 · 进行中 {{ metrics.usage.pendingCalls ?? '未知' }} 次</p><p v-if="metrics.usage.knownTotalTokens !== undefined">已知调用用量下限：≥ {{ metrics.usage.knownTotalTokens }} tokens</p></article>
    </div>
    <p class="metric-note">成功率由后台按成功 ÷（成功 + 失败）返回；进行中和取消不计入分母，INTERRUPTED 计为失败。指标仅按时间范围汇总，不受所有者、表格状态或页码影响。</p>
    <p v-if="metrics.repairs" class="metric-note">修复 {{ metrics.repairs.total }} 轮 · {{ metrics.repairs.tasksWithRepairs }} 个任务发生修复 · {{ metrics.repairs.readyAfterRepair }} 个修复后成功</p>
    <details class="trend" @toggle="expand"><summary>生成任务每日趋势（UTC）</summary>
      <p>最近最多 7 个 UTC 创建日，按所选时间窗口截取；展开时分别读取真实每日指标，各窗口可能有读取时差。</p>
      <p v-if="loading" role="status">正在读取每日指标…</p><p v-else-if="error" role="alert">{{ error }}</p>
      <p v-else-if="!trend.length">暂无趋势数据</p>
      <template v-else>
        <div class="legend"><span v-for="kind in kinds" :key="kind"><i :class="kind" aria-hidden="true" />{{ labels[kind] }}</span></div>
        <div v-for="day in trend" :key="day.day" class="trend-day"><span>{{ day.day }}</span><div class="bar" aria-hidden="true"><i v-for="kind in kinds" :key="kind" :class="kind" :style="{ width: `${day.generation[kind] / peak * 100}%` }" /></div><span>{{ kinds.map(kind => `${labels[kind]} ${day.generation[kind]}`).join(' / ') }}</span></div>
      </template>
    </details>
  </section>
</template>

<style scoped>
.metric-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 16px; }
.metric-card, .trend { background: white; border: 1px solid var(--line); border-radius: 8px; padding: 22px; }
h2 { font-size: 14px; color: #4f596b; margin-bottom: 16px; font-weight: 500; }
strong { font-size: 27px; font-weight: 600; }
p { font-size: 13px; margin: 12px 0 0; color: #586273; }
.metric-note { margin: 12px 0 20px; }
summary { font-weight: 600; cursor: pointer; min-height: 28px; }
.legend { display: flex; flex-wrap: wrap; gap: 16px; margin: 16px 0; font-size: 13px; }
.legend i { display: inline-block; width: 10px; height: 10px; margin-right: 6px; }
.trend-day { display: grid; grid-template-columns: 90px minmax(50px, 1fr) minmax(230px, 2fr); gap: 12px; align-items: center; margin-top: 12px; font-size: 12px; }
.bar { display: flex; height: 12px; background: #f3f5f8; }
.bar i { display: block; }
.succeeded { background: #237348; } .failed { background: #ad4039; } .pending { background: #4263eb; } .cancelled { background: #93713a; }
@media (max-width: 760px) { .metric-grid { grid-template-columns: 1fr; } .trend-day { grid-template-columns: 90px 1fr; } .trend-day > span:last-child { grid-column: 1 / -1; } }
</style>
