<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import BrandLogo from '../../components/BrandLogo.vue'
import ClubPage from '../../components/ClubPage.vue'
import UiIcon from '../../components/UiIcon.vue'
import { ApiError } from '../../api/http'
import { session, signIn } from './session'

const router = useRouter()
const route = useRoute()
const email = ref('')
const password = ref('')
const busy = ref(false)
const error = ref('')
const notice = computed(() => route.query.reason === 'expired'
  ? '登录状态已过期，请重新登录。'
  : route.query.reason === 'unavailable' || session.status === 'unavailable'
    ? '认证服务暂时不可用，请检查网络后重试。'
    : route.query.reason === 'required' ? '请先登录，再继续访问工作台。' : '')

async function submit() {
  if (busy.value) return
  error.value = ''
  if (!email.value.trim() || !password.value) {
    error.value = '请输入邮箱和密码。'
    return
  }
  busy.value = true
  try {
    await signIn(email.value.trim(), password.value)
    const next = typeof route.query.redirect === 'string' && route.query.redirect.startsWith('/') && !route.query.redirect.startsWith('//')
      ? route.query.redirect : '/apps'
    await router.replace(next)
  } catch (cause) {
    error.value = cause instanceof ApiError ? cause.message : '登录失败，请重试。'
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <main class="login-page"><section class="login-showcase"><router-link to="/login" class="brand-link"><BrandLogo /></router-link><div class="login-showcase__copy"><span>给每一个想动手的人</span><h1>你的想法，<br />值得一个可以打开的页面。</h1><p>从社团招新到个人作品，让第一版先发生。</p></div><div class="login-showcase__project"><ClubPage /></div><p class="login-showcase__caption">一个社团活动页，从这里开始。</p></section><section class="login-entry"><div class="login-entry__inner"><div class="login-entry__brand"><BrandLogo /></div><h2>开始你的第一件作品</h2><p>描述想法，查看页面，再慢慢打磨。</p><form @submit.prevent="submit"><div class="login-fields"><label>邮箱<input v-model="email" type="email" autocomplete="username" placeholder="name@example.com" :disabled="busy" required /></label><label>密码<input v-model="password" type="password" autocomplete="current-password" placeholder="输入你的密码" :disabled="busy" required /></label></div><p v-if="error" class="login-message" role="alert">{{ error }}</p><p v-else-if="notice" class="login-message" role="status">{{ notice }}</p><button class="button-primary login-entry__button" type="submit" :disabled="busy" :aria-busy="busy"><span>{{ busy ? '正在登录…' : '登录' }}</span><UiIcon name="arrow" :size="16" /></button></form><p class="login-entry__note">请使用已获分配的试用账号登录。</p></div><footer class="login-footer">从一个小应用开始。 CodeLess © 2026</footer></section></main>
</template>

<style scoped>
.login-message { margin: 4px 0 12px; color: #a13630; font-size: 12px; line-height: 1.6; }
.login-entry__button:disabled { cursor: wait; opacity: .7; }
.login-entry__note { margin-top: 18px !important; }
</style>
