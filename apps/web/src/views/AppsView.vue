<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import { useRouter } from 'vue-router'
import BrandLogo from '../components/BrandLogo.vue'
import ClubPage from '../components/ClubPage.vue'
import UiIcon from '../components/UiIcon.vue'

const router = useRouter()
const search = ref('')
const brief = ref('')
const feedback = ref('')
const briefInput = ref<HTMLTextAreaElement | null>(null)
const matchesDemo = computed(() => '社团活动页 校园活动与报名'.includes(search.value.trim()))
const starters = [
  { icon: 'doc', name: '个人作品集', description: '让作品替你介绍自己', prompt: '做一个个人作品集，介绍我自己，展示三个代表作品，并留下联系方式。' },
  { icon: 'calendar', name: '活动与招新', description: '把同好聚在一起', prompt: '做一个校园活动页面，介绍活动内容、时间地点和日程，并展示报名方式。' },
  { icon: 'check', name: '小组任务板', description: '让每件小事有着落', prompt: '做一个小组任务看板，可以添加任务、指定负责人，并按待办、进行中和已完成分类。' },
]

async function focusBrief(prompt?: string) {
  if (prompt) brief.value = prompt
  await nextTick()
  briefInput.value?.focus()
  briefInput.value?.scrollIntoView({ block: 'center' })
}

function submitBrief() {
  if (!brief.value.trim()) {
    feedback.value = '先写一点你的想法，再继续。'
    briefInput.value?.focus()
    return
  }
  feedback.value = '需求已填写。应用生成服务尚未接入。'
}

function showGuide() {
  document.getElementById('starters')?.scrollIntoView({ block: 'center' })
  feedback.value = '可以选一个熟悉的场景，或继续编辑示例应用。'
}
</script>

<template>
  <div class="app-layout">
    <aside class="app-sidebar">
      <router-link class="brand-link" to="/apps"><BrandLogo /></router-link>
      <div class="workspace-switch"><span class="workspace-avatar">我</span><span>个人空间<small>让小想法有个落点</small></span></div>
      <nav class="app-nav" aria-label="主导航"><p>工作空间</p><router-link class="app-nav__item is-active" to="/apps" aria-current="page"><UiIcon name="grid" />我的应用<span class="app-nav__count">1</span></router-link><button class="app-nav__item" type="button" @click="showGuide"><UiIcon name="book" />开始使用</button></nav>
      <div class="sidebar-foot"><div class="sidebar-guide"><strong>从一页开始就很好。</strong><p>一个活动、一次展示，<br />把你的想法变成可以分享的页面。</p></div><router-link class="sidebar-profile" to="/login"><span class="workspace-avatar">访</span><span>访客空间<small>本地设计预览</small></span><UiIcon name="arrow" :size="15" /></router-link></div>
    </aside>
    <div class="app-content">
      <header class="app-topbar"><span>个人空间 <span class="breadcrumb-divider">/</span> 我的应用</span><div><button type="button" @click="showGuide">使用指南</button><span class="demo-status">本地演示</span></div></header>
      <main class="dashboard">
        <div class="dashboard-heading"><div><h1>我的应用</h1><p>继续上次的创作，或开始一个新想法。</p></div><button class="button-primary" type="button" @click="focusBrief()"><UiIcon name="plus" />新建应用</button></div>
        <div class="section-heading"><h2>最近打开 <small>1</small></h2><label class="app-search"><UiIcon name="search" :size="16" /><input v-model="search" aria-label="搜索应用" type="search" placeholder="搜索应用" /></label></div>
        <div class="dashboard-grid">
          <article v-if="matchesDemo" class="project-card"><div class="project-cover"><div class="mini-browser"><div class="mini-browser__bar"><i /><i /><i /><span>社团活动页 / 首页</span></div><ClubPage compact /></div></div><div class="project-info"><div><h3>社团活动页</h3><p><span class="draft-label">草稿示例</span><span class="dot-separator">·</span>校园活动与报名</p></div><button class="button-secondary" type="button" @click="router.push('/workbench/demo')">继续编辑 <UiIcon name="arrow" :size="16" /></button></div></article>
          <div v-else class="search-empty"><h3>没有找到这个应用</h3><p>试试搜索“社团”或“活动”。</p><button class="button-secondary" type="button" @click="search = ''">清除搜索</button></div>
          <form class="brief-card" @submit.prevent="submitBrief"><div class="brief-card__title"><UiIcon name="pen" :size="20" /><h2>下一个，想做什么？</h2></div><p>先说说要给谁用、需要哪些内容。<br />一个具体的小需求就够了。</p><div class="brief-field"><label for="brief" class="sr-only">描述应用需求</label><textarea id="brief" ref="briefInput" v-model="brief" maxlength="500" placeholder="比如：做一个摄影社的招新页面，介绍社团，放几张作品，再加上报名信息。" /><div class="brief-field__bottom"><span>从想法开始</span><button class="button-primary" type="submit" aria-label="提交应用需求"><UiIcon name="up" :size="17" /></button></div></div><span class="brief-note"><UiIcon name="info" :size="13" />当前为本地演示，暂不生成应用</span></form>
        </div>
        <section id="starters" class="starters"><div class="starters__heading"><h2>还没想好？从熟悉的场景开始</h2><span>选择一个，试着描述你的需求</span></div><div class="starter-grid"><button v-for="starter in starters" :key="starter.name" class="starter-card" type="button" @click="focusBrief(starter.prompt)"><span class="starter-card__icon"><UiIcon :name="starter.icon" /></span><span><strong>{{ starter.name }}</strong><small>{{ starter.description }}</small></span><UiIcon name="arrow" :size="14" /></button></div></section>
        <footer class="dashboard-footer"><span>每个值得做的想法，都可以先有一个小版本。</span><span>CodeLess · 本地演示</span></footer>
      </main>
    </div>
    <div v-if="feedback" class="ui-toast" role="status"><span>{{ feedback }}</span><button type="button" aria-label="关闭提示" @click="feedback = ''">×</button></div>
  </div>
</template>
