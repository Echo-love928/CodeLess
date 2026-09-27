<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'
import BrandLogo from '../components/BrandLogo.vue'
import ClubPage from '../components/ClubPage.vue'
import StatePanel from '../components/StatePanel.vue'
import UiIcon from '../components/UiIcon.vue'

defineProps<{ id: string }>()

type PreviewMode = 'ready' | 'loading' | 'empty' | 'error'
type EditableElement = 'title' | 'button'
const mode = ref<PreviewMode>('ready')
const device = ref<'desktop' | 'mobile'>('desktop')
const selected = ref<EditableElement | null>(null)
const title = ref('把热爱，\n聚在一起。')
const buttonLabel = ref('了解这次活动')
const inspectorFields = ref<HTMLElement | null>(null)

watch(mode, () => { selected.value = null })

async function select(element: EditableElement) {
  selected.value = element
  await nextTick()
  if (window.innerWidth <= 640) inspectorFields.value?.scrollIntoView({ block: 'center' })
}

function changeText(event: Event) {
  const value = (event.target as HTMLTextAreaElement).value
  if (selected.value === 'title') title.value = value
  if (selected.value === 'button') buttonLabel.value = value
}
</script>

<template>
  <div class="workbench">
    <header class="workbench-header"><router-link to="/apps" class="workbench-back" aria-label="返回我的应用"><UiIcon name="back" /></router-link><router-link to="/apps" class="workbench-brand"><BrandLogo /></router-link><span class="workbench-header__divider" /><div class="workbench-header__name">社团活动页 <small>草稿示例</small></div><div class="workbench-header__actions"><span>本次修改仅在预览中生效</span><button class="button-primary" type="button" disabled title="发布功能尚未接入">发布</button></div></header>
    <div class="workbench-grid">
      <aside class="pages-panel" aria-label="项目导航"><div class="panel-heading">页面 <span>1</span></div><button class="page-item" type="button" @click="mode = 'ready'; selected = null"><UiIcon name="doc" :size="16" />首页<span>/</span></button><div class="page-outline"><span>导航</span><span>活动介绍</span><span>时间与地点</span><span>关于活动</span></div><div class="page-status"><strong>✓ 示例页面已就绪</strong><p>先查看页面，<br />再选择需要调整的内容。</p></div></aside>
      <main class="editor-main"><div class="editor-toolbar"><span class="page-path"><UiIcon name="doc" :size="15" />首页 <span>/</span></span><div class="device-toggle" aria-label="预览设备"><button type="button" :aria-pressed="device === 'desktop'" @click="device = 'desktop'"><UiIcon name="monitor" :size="15" />桌面</button><button type="button" :aria-pressed="device === 'mobile'" @click="device = 'mobile'"><UiIcon name="phone" :size="15" />手机</button></div></div>
        <div class="editor-canvas" :class="{ 'editor-canvas--mobile': device === 'mobile' }"><div class="canvas-address"><UiIcon name="lock" :size="12" />社团活动页 · 本地预览</div><ClubPage v-if="mode === 'ready'" interactive :title="title" :button-label="buttonLabel" :selected="selected" @select="select" /><StatePanel v-else :kind="mode" @action="mode = 'loading'" /></div>
        <div class="editor-caption"><span>点击标题或按钮，试着调整文案。</span><label>状态演示 <select v-model="mode" aria-label="预览状态"><option value="ready">就绪</option><option value="loading">加载中</option><option value="empty">空白</option><option value="error">错误</option></select></label></div>
      </main>
      <aside class="inspector" aria-label="属性面板"><div class="inspector-heading">属性 <small>{{ selected === 'title' ? '标题' : selected === 'button' ? '按钮' : '未选中' }}</small></div><div v-if="!selected" class="inspector-empty"><span class="selection-icon"><UiIcon name="cursor" /></span><h2>选中一处，调整一点。</h2><p>点击页面中的标题或按钮，<br />在这里修改它的文案。</p></div><div v-else ref="inspectorFields"><div class="selected-label"><UiIcon name="cursor" :size="15" />{{ selected === 'title' ? '活动标题' : '活动按钮' }}</div><label class="inspector-field">文字内容<textarea :value="selected === 'title' ? title : buttonLabel" maxlength="80" @input="changeText" /></label><div class="field-info"><span>所在区域</span><span>活动介绍</span></div><div class="field-info"><span>生效范围</span><span>当前预览</span></div><p class="inspector-tip">修改会即时显示在左侧页面中，刷新后恢复原始示例。</p><button class="text-button" type="button" @click="selected = null">取消选择</button></div></aside>
    </div>
  </div>
</template>
