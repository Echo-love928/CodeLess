const dates = new Intl.DateTimeFormat('zh-CN', {
  timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
})
export function formatDateTime(value?: string | null) {
  return value && Number.isFinite(Date.parse(value)) ? dates.format(new Date(value)) : '暂无时间'
}
const stageLabels: Record<string, string> = {
  PLAN: '需求规划', GENERATE: '页面生成', VERIFY: '页面检查', REPAIR: '自动修复', READY: '生成完成', FAILED: '任务结束',
}
export const stageLabel = (stage: string) => stageLabels[stage] ?? '未知阶段'
