<script setup lang="ts">
import { computed } from 'vue'
import { successRate, type Metrics, type Outcomes } from './admin-api'
const props = defineProps<{ metrics: Metrics }>()
const total = (value: Outcomes) => Object.values(value).reduce((sum, count) => sum + count, 0)
const peak = computed(() => Math.max(1, ...props.metrics.trend.map(day => total(day.generation))))
const kinds = ['succeeded', 'failed', 'pending', 'cancelled', 'unknown'] as const
const labels = { succeeded: '成功', failed: '失败', pending: '进行中', cancelled: '取消', unknown: '未知' }
</script>

<template>
  <section aria-label="运营指标">
    <div class="metric-grid">
      <article v-for="(value, key) in { generation: metrics.generation, deployment: metrics.deployment }" :key="key" class="metric-card">
        <h2>{{ key === 'generation' ? '生成成功率' : '部署成功率' }}</h2><strong>{{ successRate(value) }}</strong>
        <p>成功 {{ value.succeeded }} / 失败 {{ value.failed }}</p><p>进行中 {{ value.pending }} · 取消 {{ value.cancelled }} · 未知 {{ value.unknown }}</p>
      </article>
      <article class="metric-card"><h2>模型用量</h2><strong>{{ metrics.usage.unknownCalls ? '部分未知' : metrics.usage.inputTokens === null || metrics.usage.outputTokens === null ? '未知' : '已知用量' }}</strong>
        <p>输入 {{ metrics.usage.inputTokens ?? '未知' }} / 输出 {{ metrics.usage.outputTokens ?? '未知' }} tokens</p><p>用量未知的调用 {{ metrics.usage.unknownCalls }} 次</p></article>
    </div>
    <p class="metric-note">成功率 = 成功 ÷（成功 + 失败）；进行中、取消及未知不计入分母。指标按所有者和时间范围汇总，不受下方表格状态或页码影响。</p>
    <details class="trend"><summary>生成任务每日趋势（UTC）</summary>
      <p>按任务创建日统计；条形总长表示记录数，缺少的日期未补零。</p>
      <p v-if="!metrics.trend.length">暂无趋势数据</p>
      <template v-else>
        <div class="legend"><span v-for="kind in kinds" :key="kind"><i :class="kind" aria-hidden="true" />{{ labels[kind] }}</span></div>
        <div v-for="day in metrics.trend" :key="day.day" class="trend-day"><span>{{ day.day }}</span><div class="bar" aria-hidden="true"><i v-for="kind in kinds" :key="kind" :class="kind" :style="{ width: `${day.generation[kind] / peak * 100}%` }" /></div><span>{{ kinds.map(kind => `${labels[kind]} ${day.generation[kind]}`).join(' / ') }}</span></div>
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
.succeeded { background: #237348; } .failed { background: #ad4039; } .pending { background: #4263eb; } .cancelled { background: #93713a; } .unknown { background: #7e8798; }
@media (max-width: 760px) { .metric-grid { grid-template-columns: 1fr; } .trend-day { grid-template-columns: 90px 1fr; } .trend-day > span:last-child { grid-column: 1 / -1; } }
</style>
