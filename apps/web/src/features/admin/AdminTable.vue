<script setup lang="ts">
import { cancellable, statusLabel, type AdminRecord, type Resource } from './admin-api'
import { beijingTime } from './admin-time'
import { failureDescription } from '../workbench/failure-description'
defineProps<{ resource: Resource; rows: AdminRecord[]; busy: boolean; blocked: string[] }>()
defineEmits<{ cancel: [row: AdminRecord]; unpublish: [row: AdminRecord]; account: [row: AdminRecord]; password: [row: AdminRecord] }>()
const columns: Record<Resource, { key: keyof AdminRecord; label: string }[]> = {
  tasks: [{ key: 'ownerEmail', label: '所有者' }, { key: 'failureCode', label: '停止原因' }],
  applications: [{ key: 'ownerEmail', label: '所有者' }],
  deployments: [{ key: 'versionNumber', label: '版本' }, { key: 'requestedByEmail', label: '发布者' }, { key: 'failureCode', label: '失败原因' }],
  users: [{ key: 'email', label: '邮箱' }, { key: 'role', label: '角色' }, { key: 'dailyTasksUsed', label: '今日任务数' }, { key: 'dailyTaskLimit', label: '每日任务上限' }],
  'model-calls': [{ key: 'ownerEmail', label: '所有者' }, { key: 'model', label: '模型' }, { key: 'usage', label: '用量状态' }, { key: 'inputTokens', label: '输入 tokens' }, { key: 'outputTokens', label: '输出 tokens' }],
  audit: [{ key: 'actorEmail', label: '操作管理员' }, { key: 'ownerEmail', label: '任务所有者' }, { key: 'reason', label: '取消理由' }],
}
const labels: Record<Resource,string> = { tasks:'任务',applications:'应用',deployments:'部署',users:'用户','model-calls':'模型调用',audit:'取消审计' }
function title(row: AdminRecord, resource: Resource) { return resource === 'users' ? row.name || '未命名账号' : row.applicationName || row.name || '历史记录' }
function cell(row: AdminRecord, key: keyof AdminRecord, resource: Resource) {
  const value = row[key]
  if(key === 'failureCode') {
    if(row.status !== 'FAILED' && !value) return '—'
    if(!value) return '历史记录未保存失败原因'
    if(resource === 'tasks') return failureDescription(String(value),row.cancelledBy)
    const reasons: Record<string,string> = { DEPLOYMENT_PROBE_FAILED:'公开网站访问检查未通过', DEPLOYMENT_TIMEOUT:'发布超时', HOSTING_UNAVAILABLE:'托管服务不可用', DEPLOYMENT_INTERRUPTED:'发布过程被中断', DEPLOYMENT_FAILED:'发布执行失败', DEPLOYMENT_SNAPSHOT_INVALID:'版本快照不可用', DEPLOYMENT_BINDING_MISMATCH:'发布产物与版本不匹配', HOSTING_URL_INVALID:'托管地址不符合配置' }
    return reasons[String(value)] ?? String(value)
  }
  if(key === 'role' || key === 'usage') return statusLabel(value as string)
  if(key === 'versionNumber') return value == null ? '未知版本' : `第 ${value} 版`
  return value == null || value === '' ? '未提供' : String(value)
}
</script>
<template>
  <div class="table-scroll" tabindex="0" aria-label="管理记录表格，可横向滚动" :aria-busy="busy">
    <table>
      <caption class="sr-only">{{ labels[resource] }}记录；全部时间为北京时间</caption>
      <thead><tr><th scope="col">{{ resource === 'users' ? '账号' : '应用 / 记录' }}</th><th v-for="column in columns[resource]" :key="column.key" scope="col">{{ column.label }}</th><th scope="col">状态</th><th scope="col">创建时间（北京时间）</th><th v-if="['tasks','deployments','users'].includes(resource)" scope="col">管理操作</th></tr></thead>
      <tbody>
        <tr v-for="row in rows" :key="row.id">
          <th scope="row"><strong>{{ title(row,resource) }}</strong><span v-if="row.isTest" class="test-tag">测试数据</span><details><summary>查看编号</summary><p>记录：{{ row.id }}</p><p v-if="row.applicationId">应用：{{ row.applicationId }}</p><p v-if="row.versionId">版本：{{ row.versionId }}</p><p v-if="row.taskId">任务：{{ row.taskId }}</p><p v-if="row.failureCode">原因码：{{ row.failureCode }}</p></details></th>
          <td v-for="column in columns[resource]" :key="column.key">{{ cell(row,column.key,resource) }}</td>
          <td><span class="status" :data-status="row.failureCode === 'CANCELLED' ? 'CANCELLED' : row.status">{{ row.failureCode === 'CANCELLED' ? (row.cancelledBy === 'ADMIN' ? '管理员已取消' : '已取消') : statusLabel(row.status) }}</span></td>
          <td class="time">{{ beijingTime(row.createdAt) }}</td>
          <td v-if="['tasks','deployments','users'].includes(resource)"><div class="actions">
            <template v-if="resource === 'users'"><button type="button" class="button-secondary" :disabled="busy" @click="$emit('account',row)">管理账号</button><button type="button" class="button-secondary" :disabled="busy" @click="$emit('password',row)">重置密码</button></template>
            <button v-else-if="resource === 'deployments' && ['PUBLISHED','FAILED'].includes(row.status ?? '')" class="button-secondary" type="button" :disabled="busy" @click="$emit('unpublish',row)">取消发布</button>
            <button :aria-label="`取消任务 ${row.id}`" v-else-if="cancellable(row)" class="button-secondary" type="button" :disabled="busy || blocked.includes(row.id)" @click="$emit('cancel',row)">{{ blocked.includes(row.id) ? '待核对' : '取消任务' }}</button><span v-else>—</span>
          </div></td>
        </tr>
        <tr v-if="!rows.length"><td :colspan="columns[resource].length+(['tasks','deployments','users'].includes(resource) ? 4 : 3)" class="empty">{{ busy ? '正在加载记录…' : '当前筛选下没有记录' }}</td></tr>
      </tbody>
    </table>
  </div>
</template>
<style scoped>
.table-scroll { max-width: 100%; overflow: auto; background: white; border: 1px solid var(--line); border-radius: 8px; }
table { border-collapse: collapse; width: 100%; font-size: 14px; text-align: left; } th,td { border-bottom: 1px solid var(--line); padding: 16px; vertical-align: top; min-width: 120px; overflow-wrap: anywhere; } thead { background: #f8f9fc; color: #4f596b; } tbody th { font-weight: 400; min-width: 200px; } strong { font-weight: 600; } tr:last-child > * { border-bottom: 0; } .time { min-width: 180px; } details { margin-top: 8px; max-width: 320px; font-size: 12px; color: #586273; } summary { cursor: pointer; min-height: 24px; } details p { margin: 6px 0; font-family: Consolas,monospace; } .status { display: inline-block; border-radius: 4px; padding: 4px 8px; background: #eef0f4; color: #4d5667; white-space: nowrap; } [data-status="READY"],[data-status="PUBLISHED"],[data-status="SUCCEEDED"],[data-status="ACTIVE"] { color: #14613b; background: #edf8f1; } [data-status="FAILED"],[data-status="DISABLED"] { color: #9e2e29; background: #fff0ee; } .empty { text-align: center; padding: 36px; color: var(--muted); } .actions { display: flex; flex-wrap: wrap; gap: 8px; } .actions button { min-height: 44px; } .test-tag { display: inline-block; margin: 4px 8px; color: #775c1b; background: #fff6dc; padding: 3px 6px; border-radius: 4px; font-size: 12px; }
</style>
