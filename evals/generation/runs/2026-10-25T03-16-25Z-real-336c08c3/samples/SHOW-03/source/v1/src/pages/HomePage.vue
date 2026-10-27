<script setup lang="ts">
import { ref } from 'vue';
import WorksGallery from '../components/WorksGallery.vue';
import ContactBlock from '../components/ContactBlock.vue';

type TabKey = 'about' | 'works' | 'contact';

interface TabItem {
  key: TabKey;
  label: string;
}

const tabs: TabItem[] = [
  { key: 'about', label: '关于我' },
  { key: 'works', label: '作品集' },
  { key: 'contact', label: '联系方式' },
];

const activeTab = ref<TabKey>('about');

function selectTab(key: TabKey): void {
  activeTab.value = key;
}
</script>

<template>
  <main data-ai-component="home-page" class="home-page">
    <header class="home-page__header">
      <h1 class="home-page__name" data-testid="profile-name">林夏</h1>
      <p class="home-page__role">自然与人像摄影师</p>
      <nav class="home-page__nav">
        <button
          v-for="tab in tabs"
          :key="tab.key"
          type="button"
          class="nav-button"
          :class="{ 'nav-button--active': activeTab === tab.key }"
          :data-testid="`nav-${tab.key}`"
          @click="selectTab(tab.key)"
        >
          {{ tab.label }}
        </button>
      </nav>
    </header>

    <section v-if="activeTab === 'about'" class="panel" data-testid="panel-about">
      <h2 class="panel__title">关于我</h2>
      <p class="panel__text" data-testid="about-text">
        我是林夏，一名专注于自然与城市题材的摄影师，喜欢用光线记录旅行中的片刻安静。
      </p>
    </section>

    <WorksGallery v-else-if="activeTab === 'works'" />

    <ContactBlock v-else />
  </main>
</template>

<style scoped>
.home-page {
  min-height: 100vh;
  box-sizing: border-box;
  padding: 2rem 1.5rem;
  background: #f3f4f6;
  color: #1f2937;
  font-family: system-ui, -apple-system, 'Segoe UI', sans-serif;
}

.home-page__header {
  margin-bottom: 1.5rem;
}

.home-page__name {
  font-size: 2rem;
  margin: 0;
}

.home-page__role {
  margin: 0.35rem 0 1rem;
  color: #6b7280;
}

.home-page__nav {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
}

.nav-button {
  padding: 0.5rem 1.1rem;
  border: 1px solid #cbd5e1;
  border-radius: 999px;
  background: #ffffff;
  color: #374151;
  font-size: 0.95rem;
  cursor: pointer;
}

.nav-button--active {
  background: #1f2937;
  border-color: #1f2937;
  color: #ffffff;
}

.panel {
  background: #ffffff;
  border-radius: 10px;
  padding: 1.5rem;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.08);
}

.panel__title {
  font-size: 1.5rem;
  margin: 0 0 0.75rem;
}

.panel__text {
  margin: 0;
  line-height: 1.7;
  color: #4b5563;
}
</style>
