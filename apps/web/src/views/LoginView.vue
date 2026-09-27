<script setup lang="ts">
import BrandLogo from '../components/BrandLogo.vue'
import ClubPage from '../components/ClubPage.vue'
import UiIcon from '../components/UiIcon.vue'
</script>

<template>
  <main class="login-page"><section class="login-showcase"><router-link to="/login" class="brand-link"><BrandLogo /></router-link><div class="login-showcase__copy"><span>给每一个想动手的人</span><h1>你的想法，<br />值得一个可以打开的页面。</h1><p>从社团招新到个人作品，让第一版先发生。</p></div><div class="login-showcase__project"><ClubPage /></div><p class="login-showcase__caption">一个社团活动页，从这里开始。</p></section><section class="login-entry"><div class="login-entry__inner"><div class="login-entry__brand"><BrandLogo /></div><h2>开始你的第一件作品</h2><p>描述想法，查看页面，再慢慢打磨。</p><div class="login-fields" aria-label="待接入的账号登录表单"><label>邮箱<input type="email" placeholder="name@example.com" disabled /></label><label>密码<input type="password" placeholder="输入你的密码" disabled /></label></div><router-link to="/apps" class="button-primary login-entry__button">进入本地演示 <UiIcon name="arrow" :size="16" /></router-link><div class="login-divider">当前为本地演示</div><p class="login-entry__note">账号登录尚未开放。你可以直接进入演示空间，体验应用列表与页面编辑。</p></div><footer class="login-footer">从一个小应用开始。 CodeLess © 2026</footer></section></main>
</template>
