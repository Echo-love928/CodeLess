<script setup lang="ts">
import { ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import BrandLogo from '../../components/BrandLogo.vue'
import StatePanel from '../../components/StatePanel.vue'
import UiIcon from '../../components/UiIcon.vue'
import { ApiError } from '../../api/http'
import { type Application, getApplication } from '../apps/application-api'
import { redirectOnUnauthorized } from '../apps/redirect-on-unauthorized'
import TaskStatus from './TaskStatus.vue'

const props = defineProps<{ id: string }>()
const router = useRouter()
const app = ref<Application | null>(null)
const loading = ref(true)
const error = ref('')
const prompt = ref('')
const device = ref<'desktop' | 'mobile'>('desktop')

async function load() {
  const requestedId = props.id
  loading.value = true
  error.value = ''
  app.value = null
  try {
    const result = await getApplication(requestedId)
    if (requestedId === props.id) app.value = result
  } catch (cause) {
    if (requestedId === props.id) {
      if (!(await redirectOnUnauthorized(cause, router))) {
        error.value = cause instanceof ApiError && cause.status === 404
          ? '应用不存在或你无权访问。'
          : cause instanceof Error ? cause.message : '应用加载失败。'
      }
    }
  } finally {
    if (requestedId === props.id) loading.value = false
  }
}

watch(() => props.id, load, { immediate: true })
</script>

<template>
  <div class="workbench">
    <header class="workbench-header"><router-link to="/apps" class="workbench-back" aria-label="返回我的应用"><UiIcon name="back" /></router-link><router-link to="/apps" class="workbench-brand"><BrandLogo /></router-link><span class="workbench-header__divider" /><div class="workbench-header__name">{{ app?.name || '工作台' }} <small v-if="app">应用 {{ app.id }}</small></div><div class="workbench-header__actions"><button class="button-primary" type="button" disabled title="发布功能尚未接入">发布</button></div></header>
    <main v-if="loading" class="workbench-message" role="status">正在加载应用…</main>
    <main v-else-if="error" class="workbench-message" role="alert"><h1>无法打开工作台</h1><p>{{ error }}</p><button class="button-secondary" type="button" @click="load">重试</button></main>
    <div v-else-if="app" class="workbench-content">
      <aside class="workbench-side" aria-label="需求与任务">
        <div><h2>你的需求</h2><p>描述想生成的 Vue 页面。生成服务接入后可从这里发起任务。</p><label for="workbench-prompt">需求描述</label><textarea id="workbench-prompt" v-model="prompt" maxlength="8000" placeholder="例如：创建一个展示活动日程的页面" /><button class="button-primary" type="button" disabled title="生成接口尚未接入">开始生成（待接入）</button></div>
        <div class="workbench-task"><h2>任务进度</h2><TaskStatus :task="null" /></div>
      </aside>
      <section class="workbench-preview" aria-label="预览区"><div class="editor-toolbar"><span class="page-path"><UiIcon name="doc" :size="15" />预览 <span>/</span> 初始草稿版本：{{ app.baseVersionId }} <span>/</span> 当前可用版本：{{ app.latestReadyVersionId || '暂无' }}</span><div class="device-toggle" aria-label="预览设备"><button type="button" :aria-pressed="device === 'desktop'" @click="device = 'desktop'"><UiIcon name="monitor" :size="15" />桌面</button><button type="button" :aria-pressed="device === 'mobile'" @click="device = 'mobile'"><UiIcon name="phone" :size="15" />手机</button></div></div><div class="editor-canvas" :class="{ 'editor-canvas--mobile': device === 'mobile' }"><div class="canvas-address"><UiIcon name="lock" :size="12" />{{ app.name }} · 预览</div><StatePanel kind="empty" :title="app.latestReadyVersionId ? '预览尚未接入' : '暂无可预览版本'" :description="app.latestReadyVersionId ? '已验证版本存在；页面预览接口尚未接入。' : '初始草稿尚未生成内容；完成生成与验证后才能预览。'" /></div></section>
    </div>
  </div>
</template>

<style scoped>
.workbench-header__name { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.workbench-header__name small { overflow-wrap: anywhere; }
.workbench-message { max-width: 650px; margin: 80px auto; padding: 32px; text-align: center; }
.workbench-message h1 { font-size: 22px; }
.workbench-message p { color: #687384; }
.workbench-content { display: grid; grid-template-columns: minmax(270px, 330px) minmax(0, 1fr); min-height: calc(100vh - 65px); }
.workbench-side { padding: 28px 22px; background: white; border-right: 1px solid #e1e5ec; }
.workbench-side h2 { margin: 0 0 12px; font-size: 15px; }
.workbench-side p { color: #6b7484; font-size: 12px; line-height: 1.7; }
.workbench-side label { display: block; margin: 22px 0 9px; font-size: 12px; }
.workbench-side textarea { width: 100%; min-height: 145px; padding: 12px; resize: vertical; border: 1px solid #dbe0e9; border-radius: 7px; font-size: 12px; line-height: 1.7; }
.workbench-side > div > .button-primary { width: 100%; margin-top: 12px; }
.workbench-side button:disabled { opacity: .6; cursor: default; }
.workbench-task { margin-top: 38px; padding-top: 24px; border-top: 1px solid #e1e5ec; }
.workbench-preview { min-width: 0; padding: 0 27px 30px; background: #f0f2f5; }
.page-path { min-width: 0; overflow-wrap: anywhere; }
@media (max-width: 900px) { .workbench-content { grid-template-columns: 1fr; } .workbench-side { border-right: 0; border-bottom: 1px solid #e1e5ec; } }
@media (max-width: 640px) { .workbench-header__name small { display: none; } .workbench-preview { padding: 0 13px 20px; } .workbench-side { padding: 22px 18px; } }
</style>
