<script setup lang="ts">
import SharedCard from '../components/SharedCard.vue'
const items = ['甲', '乙']
</script>
<template>
  <main data-ai-component="home-page">
    <h1>组件映射样例</h1>
    <SharedCard v-for="item in items" :key="item" :label="item" />
    <section aria-label="嵌套区域"><SharedCard label="丙" /></section>
  </main>
</template>
