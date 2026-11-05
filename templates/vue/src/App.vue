<script setup lang="ts">
import { navigation } from './router'
</script>

<template>
  <nav v-if="navigation.length > 1" class="app-navigation" aria-label="页面导航">
    <router-link v-for="page in navigation" :key="page.path" :to="page.path" exact-active-class="is-current">{{ page.label }}</router-link>
  </nav>
  <router-view />
</template>

<style scoped>
.app-navigation { display: flex; flex-wrap: wrap; gap: 8px; padding: 12px 20px; background: #fff; border-bottom: 1px solid #e2e8f0; }
.app-navigation a { padding: 10px 16px; color: #334155; text-decoration: none; border-radius: 6px; }
.app-navigation a:hover, .app-navigation .is-current { background: #eef2ff; color: #3730a3; }
.app-navigation a:focus-visible { outline: 2px solid #4f46e5; outline-offset: 2px; }
</style>
