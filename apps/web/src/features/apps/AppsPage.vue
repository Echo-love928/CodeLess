<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import BrandLogo from '../../components/BrandLogo.vue'
import ClubPage from '../../components/ClubPage.vue'
import UiIcon from '../../components/UiIcon.vue'
import { ApiError } from '../../api/http'
import { type Application, createMockApplication, listMockApplications } from '../../api/mock-applications'
import { clearSession, session, signOut } from '../auth/session'

const router = useRouter()
const apps = ref<Application[]>([])
const search = ref('')
const loading = ref(true)
const loadError = ref('')
const feedback = ref('')
const dialogOpen = ref(false)
const name = ref('')
const description = ref('')
const dataMode = ref<Application['dataMode']>('MOCK')
const creating = ref(false)
const createError = ref('')
const signingOut = ref(false)
const filtered = computed(() => apps.value.filter(app => `${app.name} ${app.description ?? ''}`.includes(search.value.trim())))

async function load() {
  if (!session.user) return
  loading.value = true
  loadError.value = ''
  try { apps.value = await listMockApplications(session.user.id) }
  catch (cause) { loadError.value = cause instanceof Error ? cause.message : '应用列表加载失败。' }
  finally { loading.value = false }
}
onMounted(load)

function openDialog() {
  name.value = ''
  description.value = ''
  dataMode.value = 'MOCK'
  createError.value = ''
  dialogOpen.value = true
}

async function createApp() {
  if (creating.value || !session.user) return
  createError.value = ''
  creating.value = true
  try {
    const created = await createMockApplication(session.user.id, { name: name.value, description: description.value, dataMode: dataMode.value })
    apps.value = [apps.value[0], created, ...apps.value.slice(1)].filter((app): app is Application => Boolean(app))
    dialogOpen.value = false
    feedback.value = '测试应用壳已创建；生成与真实保存尚未接入。'
  } catch (cause) {
    createError.value = cause instanceof Error ? cause.message : '创建失败，请重试。'
  } finally { creating.value = false }
}

async function logout() {
  if (signingOut.value) return
  signingOut.value = true
  feedback.value = ''
  try {
    await signOut()
    await router.replace('/login')
  } catch (cause) {
    if (cause instanceof ApiError && cause.kind === 'unauthorized') {
      clearSession()
      await router.replace('/login')
    } else feedback.value = cause instanceof ApiError ? cause.message : '退出失败，请重试。'
  } finally { signingOut.value = false }
}
</script>

<template>
  <div class="app-layout">
    <aside class="app-sidebar">
      <router-link class="brand-link" to="/apps"><BrandLogo /></router-link>
      <div class="workspace-switch"><span class="workspace-avatar">{{ session.user?.displayName?.slice(0, 1) || '我' }}</span><span>个人空间<small>让小想法有个落点</small></span></div>
      <nav class="app-nav" aria-label="主导航"><p>工作空间</p><router-link class="app-nav__item is-active" to="/apps" aria-current="page"><UiIcon name="grid" />我的应用<span class="app-nav__count">{{ apps.length }}</span></router-link><button class="app-nav__item" type="button" @click="openDialog"><UiIcon name="book" />开始使用</button></nav>
      <div class="sidebar-foot"><div class="sidebar-guide"><strong>从一页开始就很好。</strong><p>一个活动、一次展示，<br />把你的想法变成可以分享的页面。</p></div><div class="sidebar-profile"><span class="workspace-avatar">{{ session.user?.displayName?.slice(0, 1) || '我' }}</span><span>{{ session.user?.displayName }}<small>{{ session.user?.email }}</small></span><button type="button" :disabled="signingOut" @click="logout">{{ signingOut ? '退出中…' : '退出' }}</button></div></div>
    </aside>
    <div class="app-content">
      <header class="app-topbar"><span>个人空间 <span class="breadcrumb-divider">/</span> 我的应用</span><div><span class="demo-status">应用接口：测试替身</span></div></header>
      <main class="dashboard">
        <div class="dashboard-heading"><div><h1>我的应用</h1><p>继续上次的创作，或开始一个新想法。</p></div><button class="button-primary" type="button" @click="openDialog"><UiIcon name="plus" />新建应用</button></div>
        <div class="section-heading"><h2>最近打开 <small>{{ apps.length }}</small></h2><label class="app-search"><UiIcon name="search" :size="16" /><input v-model="search" aria-label="搜索应用" type="search" placeholder="搜索应用" /></label></div>
        <p v-if="loading" role="status">正在加载应用…</p>
        <div v-else-if="loadError" role="alert" class="search-empty"><h3>应用列表加载失败</h3><p>{{ loadError }}</p><button class="button-secondary" type="button" @click="load">重试</button></div>
        <div v-else class="dashboard-grid">
          <template v-if="filtered.length"><article v-for="app in filtered" :key="app.id" class="project-card"><div class="project-cover"><div v-if="app.id === '11111111-1111-4111-8111-111111111111'" class="mini-browser"><div class="mini-browser__bar"><i /><i /><i /><span>社团活动页 / 首页</span></div><ClubPage compact /></div><div v-else class="mock-cover">Vue 应用壳</div></div><div class="project-info"><div><h3>{{ app.name }}</h3><p><span class="draft-label">测试替身</span><span class="dot-separator">·</span>{{ app.description || '尚无描述' }}</p></div><button v-if="app.id === '11111111-1111-4111-8111-111111111111'" class="button-secondary" type="button" @click="router.push(`/workbench/${app.id}`)">继续编辑 <UiIcon name="arrow" :size="16" /></button><span v-else class="mock-note">生成尚未接入</span></div></article></template>
          <div v-else class="search-empty"><h3>没有找到这个应用</h3><p>试试其他关键词。</p><button class="button-secondary" type="button" @click="search = ''">清除搜索</button></div>
          <div class="brief-card"><div class="brief-card__title"><UiIcon name="pen" :size="20" /><h2>下一个，想做什么？</h2></div><p>先给应用起个名字，再选择数据模式。</p><button class="button-primary" type="button" @click="openDialog">创建测试应用壳</button><span class="brief-note"><UiIcon name="info" :size="13" />此列表由本地测试替身提供，尚未保存到平台服务。</span></div>
        </div>
        <footer class="dashboard-footer"><span>每个值得做的想法，都可以先有一个小版本。</span><span>CodeLess · 应用接口测试替身</span></footer>
      </main>
    </div>
    <div v-if="dialogOpen" class="dialog-backdrop" @click.self="dialogOpen = false"><form class="create-dialog" role="dialog" aria-modal="true" aria-labelledby="create-title" @submit.prevent="createApp"><h2 id="create-title">新建应用</h2><p>创建本地测试应用壳。真实应用 CRUD 将在 D04 接入。</p><label>应用名称<input v-model="name" maxlength="120" required :disabled="creating" autofocus /></label><label>简介<input v-model="description" maxlength="1000" :disabled="creating" /></label><label>数据模式<select v-model="dataMode" :disabled="creating"><option value="STATIC">静态数据</option><option value="MOCK">Mock 数据</option><option value="LOCAL_STORAGE">LocalStorage</option></select></label><p v-if="createError" role="alert">{{ createError }}</p><div class="dialog-actions"><button type="button" class="button-secondary" :disabled="creating" @click="dialogOpen = false">取消</button><button type="submit" class="button-primary" :disabled="creating">{{ creating ? '创建中…' : '创建' }}</button></div></form></div>
    <div v-if="feedback" class="ui-toast" role="status"><span>{{ feedback }}</span><button type="button" aria-label="关闭提示" @click="feedback = ''">×</button></div>
  </div>
</template>

<style scoped>
.sidebar-profile button { margin-left: auto; white-space: nowrap; color: var(--blue); font-size: 12px; }
.sidebar-profile button:disabled { opacity: .6; }
.mock-cover { height: 100%; display: grid; place-items: center; color: #5c725f; font-size: 20px; }
.mock-note { color: var(--muted); font-size: 11px; }
.dialog-backdrop { position: fixed; inset: 0; z-index: 40; background: #1f283e80; display: grid; place-items: center; padding: 16px; }
.create-dialog { width: min(100%, 420px); background: #fff; border-radius: 12px; padding: 28px; box-shadow: 0 20px 60px #1f283e40; }
.create-dialog h2 { margin: 0 0 8px; font-size: 22px; }
.create-dialog > p { color: var(--muted); font-size: 12px; line-height: 1.7; }
.create-dialog label { display: block; margin-top: 16px; color: var(--muted); font-size: 12px; }
.create-dialog input, .create-dialog select { display: block; width: 100%; margin-top: 7px; padding: 10px; border: 1px solid var(--line); border-radius: 6px; background: #fff; color: var(--ink); }
.create-dialog [role="alert"] { color: #a13630; }
.dialog-actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 24px; }
.dialog-actions button:disabled { opacity: .6; cursor: wait; }
</style>
