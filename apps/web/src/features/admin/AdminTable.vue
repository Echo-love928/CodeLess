<script setup lang="ts">
import { cancellable, statusLabel, type AdminRecord, type Resource } from './admin-api'
defineProps<{ resource: Resource; rows: AdminRecord[]; busy: boolean; blocked: string[] }>()
defineEmits<{ cancel: [row: AdminRecord] }>()
const columns: Record<Resource, { key: keyof AdminRecord; label: string }[]> = {
  tasks: [{ key: 'applicationId', label: '应用 ID' }, { key: 'ownerId', label: '所有者 ID' }, { key: 'failureCode', label: '失败原因码' }],
  applications: [{ key: 'name', label: '应用名称' }, { key: 'ownerId', label: '所有者 ID' }],
  deployments: [{ key: 'applicationId', label: '应用 ID' }, { key: 'versionId', label: '版本 ID' }, { key: 'ownerId', label: '所有者 ID' }],
  users: [{ key: 'name', label: '显示名称' }, { key: 'email', label: '邮箱' }, { key: 'role', label: '角色' }],
  'model-calls': [{ key: 'taskId', label: '任务 ID' }, { key: 'model', label: '模型' }, { key: 'inputTokens', label: '输入 tokens' }, { key: 'outputTokens', label: '输出 tokens' }],
}
function cell(row: AdminRecord, key: keyof AdminRecord) {
  const value = row[key]
  return value === null || value === undefined || value === '' ? '未知 / 未提供' : String(value)
}
</script>

<template>
  <div class="table-scroll" tabindex="0" aria-label="管理记录表格，可横向滚动" :aria-busy="busy">
    <table>
      <caption class="sr-only">{{ { tasks: '任务', applications: '应用', deployments: '部署', users: '用户', 'model-calls': '模型调用' }[resource] }}记录；时间按浏览器时区显示</caption>
      <thead><tr><th scope="col">记录 ID</th><th v-for="column in columns[resource]" :key="column.key" scope="col">{{ column.label }}</th><th v-if="resource !== 'users'" scope="col">状态</th><th scope="col">创建时间</th><th v-if="resource === 'tasks'" scope="col">管理操作</th></tr></thead>
      <tbody>
        <tr v-for="row in rows" :key="row.id">
          <th scope="row" class="identifier">{{ row.id }}</th>
          <td v-for="column in columns[resource]" :key="column.key" :class="{ identifier: column.key.endsWith('Id') }">{{ column.key === 'role' ? statusLabel(row.role) : cell(row, column.key) }}</td>
          <td v-if="resource !== 'users'"><span class="status" :data-status="row.status">{{ statusLabel(row.status) }}</span></td>
          <td>{{ new Date(row.createdAt).toLocaleString() }}</td>
          <td v-if="resource === 'tasks'"><button v-if="cancellable(row)" class="button-secondary" type="button" :disabled="busy || blocked.includes(row.id)" :aria-label="`取消任务 ${row.id}`" @click="$emit('cancel', row)">{{ blocked.includes(row.id) ? '已提交 / 待核对' : '取消任务' }}</button><span v-else>—</span></td>
        </tr>
        <tr v-if="!rows.length"><td :colspan="columns[resource].length + (resource === 'tasks' ? 4 : resource === 'users' ? 2 : 3)" class="empty">{{ busy ? '正在加载记录…' : '当前筛选下没有记录' }}</td></tr>
      </tbody>
    </table>
  </div>
</template>

<style scoped>
.table-scroll { max-width: 100%; overflow: auto; background: white; border: 1px solid var(--line); border-radius: 8px; }
table { border-collapse: collapse; width: 100%; font-size: 13px; text-align: left; }
th, td { border-bottom: 1px solid var(--line); padding: 16px; vertical-align: top; min-width: 130px; overflow-wrap: anywhere; }
thead { background: #f8f9fc; color: #4f596b; }
tbody th { font-weight: 500; }
tr:last-child > * { border-bottom: 0; }
.identifier { min-width: 190px; font-family: Consolas, monospace; }
.status { display: inline-block; border-radius: 4px; padding: 4px 8px; background: #eef0f4; color: #4d5667; white-space: nowrap; }
[data-status="READY"], [data-status="PUBLISHED"], [data-status="SUCCEEDED"] { color: #14613b; background: #edf8f1; }
[data-status="FAILED"] { color: #9e2e29; background: #fff0ee; }
.empty { text-align: center; padding: 36px; color: var(--muted); }
</style>
