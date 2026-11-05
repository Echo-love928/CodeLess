<script setup lang="ts">
import { nextTick, onMounted, ref } from 'vue'
import { ApiError } from '../../api/http'
import { manageUser, type AdminRecord } from './admin-api'
const props = defineProps<{ mode: 'create' | 'status' | 'password'; user?: AdminRecord }>()
const emit = defineEmits<{ close: []; saved: []; 'authorization-error': [error: unknown] }>()
const dialog = ref<HTMLDialogElement>(), email = ref(''), displayName = ref(''), password = ref(''), role = ref('USER')
const status = ref(props.user?.status ?? 'ACTIVE'), isTest = ref(props.user?.isTest ?? false), busy = ref(false), error = ref('')
const titles = { create: '创建账号', status: '管理账号', password: '重置密码' }
onMounted(() => { void nextTick(() => dialog.value?.showModal()) })
function close() { if (!busy.value) emit('close') }
async function submit() {
  if(busy.value) return
  error.value = ''
  if(props.mode !== 'status' && ([...password.value].length < 12 || new TextEncoder().encode(password.value).length > 72)) { error.value = '密码至少 12 个字符且不超过 72 个 UTF-8 字节。'; return }
  busy.value = true
  try {
    const body = props.mode === 'create' ? { email: email.value.trim(), displayName: displayName.value.trim(), password: password.value, role: role.value, isTest: isTest.value }
      : props.mode === 'status' ? { status: status.value, isTest: isTest.value } : { password: password.value }
    await manageUser(props.mode, props.user?.id, body)
    password.value = ''; emit('saved')
  } catch(cause) {
    if(cause instanceof ApiError && ['unauthorized','forbidden'].includes(cause.kind)) emit('authorization-error',cause)
    else error.value = cause instanceof Error ? cause.message : '操作未获确认，请刷新核对。'
  } finally { busy.value = false }
}
</script>
<template>
  <dialog ref="dialog" aria-labelledby="account-title" @cancel.prevent="close">
    <form @submit.prevent="submit">
      <h2 id="account-title">{{ titles[mode] }}</h2><p v-if="user">{{ user.name }} · {{ user.email }}</p>
      <template v-if="mode === 'create'">
        <label>邮箱<input v-model="email" type="email" required maxlength="320" autocomplete="off" :disabled="busy"></label>
        <label>显示名称<input v-model="displayName" required maxlength="120" :disabled="busy"></label>
        <label>角色<select v-model="role" :disabled="busy"><option value="USER">普通用户</option><option value="ADMIN">管理员</option></select></label>
      </template>
      <label v-if="mode !== 'status'">新密码<input v-model="password" type="password" required minlength="12" maxlength="72" autocomplete="new-password" :disabled="busy" aria-describedby="password-help"></label>
      <p v-if="mode !== 'status'" id="password-help">至少 12 个字符，最多 72 个 UTF-8 字节。请通过安全渠道交给账号使用者。</p>
      <label v-if="mode === 'status'">账号状态<select v-model="status" :disabled="busy"><option value="ACTIVE">启用</option><option value="DISABLED">停用</option></select></label>
      <label v-if="mode !== 'password'" class="check"><input v-model="isTest" type="checkbox" :disabled="busy">测试账号：其数据默认不计入运营指标</label>
      <p v-if="mode === 'password'">保存后，该账号的所有旧会话立即失效，需要用新密码重新登录。</p>
      <p v-if="mode === 'status'">停用后，账号无法登录，旧会话也会失效。应用与历史记录会保留。</p>
      <p v-if="error" class="error" role="alert">{{ error }}</p>
      <div class="actions"><button type="button" class="button-secondary" :disabled="busy" @click="close">取消</button><button type="submit" class="button-primary" :disabled="busy">{{ busy ? '正在保存…' : '确认保存' }}</button></div>
    </form>
  </dialog>
</template>
<style scoped>
dialog { border: 1px solid var(--line); border-radius: 10px; padding: 28px; width: min(520px,calc(100% - 32px)); max-height: calc(100vh - 32px); overflow: auto; margin: auto; }
dialog::backdrop { background: #1f283e80; } h2 { font-size: 22px; margin: 0 0 16px; } p { font-size: 14px; line-height: 1.7; color: #586273; margin: 12px 0; overflow-wrap: anywhere; }
label { display: block; margin: 16px 0; font-size: 14px; } input,select { width: 100%; margin-top: 8px; border: 1px solid #a4adbc; border-radius: 5px; padding: 11px; background: white; color: var(--ink); } .check { display: flex; gap: 8px; align-items: center; line-height: 1.6; } .check input { width: auto; margin: 0; } .actions { display: flex; justify-content: flex-end; gap: 12px; margin-top: 24px; } .error { color: #9e2e29; }
</style>
