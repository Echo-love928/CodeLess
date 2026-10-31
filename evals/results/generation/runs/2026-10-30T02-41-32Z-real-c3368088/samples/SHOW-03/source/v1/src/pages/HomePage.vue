<script setup lang="ts">
import { ref } from 'vue';
import NavBar from '../components/NavBar.vue';
import WorkCard from '../components/WorkCard.vue';
import { works } from '../data/works';

const active = ref<string>('about');

function onChange(section: string): void {
  active.value = section;
}
</script>

<template>
  <main class="home-page" data-ai-component="home-page">
    <header class="hero">
      <h1 class="site-title">林夏摄影作品集</h1>
      <NavBar :active="active" @change="onChange" />
    </header>

    <section v-if="active === 'about'" class="panel">
      <h2 class="panel-title">关于我</h2>
      <p class="panel-text">我是摄影师林夏，专注记录山野与城市之间的光影片段，喜欢用简洁的画面讲述安静的故事。</p>
    </section>

    <section v-else-if="active === 'works'" class="panel">
      <h2 class="panel-title">作品集</h2>
      <div class="work-grid">
        <WorkCard v-for="work in works" :key="work.id" :work="work" />
      </div>
    </section>

    <section v-else class="panel">
      <h2 class="panel-title">联系方式</h2>
      <p class="panel-text">邮箱：linxia@example.com</p>
    </section>
  </main>
</template>

<style scoped>
.home-page {
  min-height: 100vh;
  background: #f7f4ef;
  color: #3d3933;
  font-family: system-ui, sans-serif;
  padding-bottom: 40px;
}
.hero {
  border-bottom: 1px solid #e0dcd4;
  background: #fff;
}
.site-title {
  margin: 0;
  padding: 24px 16px 0;
  text-align: center;
  font-size: 22px;
  font-weight: 600;
}
.panel {
  max-width: 780px;
  margin: 28px auto 0;
  padding: 0 16px;
}
.panel-title {
  font-size: 18px;
  margin: 0 0 12px;
}
.panel-text {
  margin: 0;
  line-height: 1.7;
  color: #5c564d;
}
.work-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 16px;
}
</style>
