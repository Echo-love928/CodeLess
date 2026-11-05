export const beijingTime = (value: string | number | Date) => new Intl.DateTimeFormat('zh-CN', {
  timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
}).format(new Date(value))
export function filterTime(value: string): string {
  if (!/^\d{4}-\d\d-\d\dT\d\d:\d\d(?::\d\d)?$/.test(value) || !Number.isFinite(Date.parse(value + '+08:00'))) throw new Error('请输入有效的北京时间。')
  return new Date(value + '+08:00').toISOString()
}
export function filterInstant(value: string): number {
  return Date.parse(/(?:Z|[+-]\d\d:\d\d)$/.test(value) ? value : filterTime(value))
}
