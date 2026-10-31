<script setup lang="ts">
import { ref } from 'vue';
import WorkCard from '../components/WorkCard.vue';
import { works } from '../data/works';
import type { Work } from '../data/works';

type SectionKey = 'about' | 'works' | 'contact';

const activeSection = ref<SectionKey>('about');

interface NavItem {
  key: SectionKey;
  label: string;
}

const navItems: NavItem[] = [
  { key: 'about', label: '关于我' },
  { key: 'works', label: '作品集' },
  { key: 'contact', label: '联系方式' }
];

const workList: Work[] = works;

function selectSection(key: SectionKey): void {
  activeSection.value = key;
}
</script>

<template>
  <div class="home-page" data-ai-component="home-page">
    <header class="page-header">
      <h1 class="page-title">摄影师林夏</h1>
      <nav class="nav-bar">
        <button
          v-for="item in navItems"
          :key="item.key"
          type="button"
          class="nav-button"
          :class="{ active: activeSection === item.key }"
          :data-testid="'nav-' + item.key"
          @click="selectSection(item.key)"
        >
          {{ item.label }}
        </button>
      </nav>
    </header>

    <main class="content">
      <section v-if="activeSection === 'about'" class="section" data-testid="section-about">
        <h2 class="section-title">关于我</h2>
        <p class="section-text">
          我是林夏，一名专注于自然与城市景观的摄影师，用镜头记录光影与旅途中的故事。
        </p>
      </section>

      <section v-else-if="activeSection === 'works'" class="section" data-testid="section-works">
        <h2 class="section-title">作品集</h2>
        <div class="work-grid">
          <WorkCard v-for="work in workList" :key="work.id" :work="work" />
        </div>
      </section>

      <section v-else class="section" data-testid="section-contact">
        <h2 class="section-title">联系方式</h2>
        <p class="section-text">邮箱：<span class="email" data-testid="contact-email">linxia@example.com</span></p>
      </section>
    </main>
  </div>
</template>

<style scoped>
.home-page {
  min-height: 100vh;
  background: #f7f7f5;
  font-family: system-ui, sans-serif;
  color: #222;
}

.page-header {
  padding: 24px 20px 0;
  background: #fff;
  border-bottom: 1px solid #e5e5e5;
}

.page-title {
  margin: 0 0 16px;
  font-size: 24px;
}

.nav-bar {
  display: flex;
  gap: 8px;
}

.nav-button {
  padding: 8px 18px;
  border: 1px solid #ccc;
  border-bottom: none;
  border-radius: 6px 6px 0 0;
  background: #f0f0f0;
  color: #444;
  font-size: 14px;
  cursor: pointer;
}

.nav-button.active {
  background: #fff;
  color: #111;
  font-weight: 600;
}

.content {
  padding: 24px 20px;
}

.section-title {
  margin: 0 0 12px;
  font-size: 20px;
}

.section-text {
  margin: 0;
  line-height: 1.7;
}

.email {
  font-weight: 600;
}

.work-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 16px;
}
</style>
