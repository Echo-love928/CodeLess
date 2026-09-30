<script setup lang="ts">
const projects = [
  { name: '城市散步', detail: '用影像记录熟悉街道里的新发现。' },
  { name: '色彩笔记', detail: '一组关于日常物件的视觉实验。' }
]
</script>

<template>
  <main class="showcase">
    <p class="eyebrow">个人展示 / 2026</p>
    <h1>林予安，设计与摄影</h1>
    <p class="intro">关注城市、人与日常生活之间的细节。</p>
    <section aria-label="作品"><article v-for="project in projects" :key="project.name">
      <h2>{{ project.name }}</h2><p>{{ project.detail }}</p>
    </article></section>
    <a href="mailto:hello@example.com">联系我</a>
  </main>
</template>

<style scoped>
.showcase{max-width:760px;margin:8vh auto;padding:32px;color:#1e293b;font-family:system-ui}.eyebrow{color:#b45309;letter-spacing:.18em}.intro{font-size:1.25rem}section{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:18px;margin:40px 0}article{padding:24px;background:#f8f3e9;border-radius:16px}a{color:#92400e}
</style>
