<script setup lang="ts">
import { ref } from 'vue';
import PortfolioCard from '../components/PortfolioCard.vue';
import { aboutText, email, works, type Work } from '../data/portfolio';

type Section = 'about' | 'works' | 'contact';

const active = ref<Section>('about');
const workList: Work[] = works;
</script>

<template>
  <main data-ai-component="home-page" class="page">
    <header class="header">
      <h1 class="site-title">林夏摄影作品集</h1>
      <nav class="nav">
        <button type="button" :class="{ on: active === 'about' }" @click="active = 'about'">关于我</button>
        <button type="button" :class="{ on: active === 'works' }" @click="active = 'works'">作品集</button>
        <button type="button" :class="{ on: active === 'contact' }" @click="active = 'contact'">联系方式</button>
      </nav>
    </header>

    <section v-if="active === 'about'" class="block" data-testid="about-section">
      <h2 class="block-title">关于我</h2>
      <p class="about-text">{{ aboutText }}</p>
    </section>

    <section v-else-if="active === 'works'" class="block" data-testid="works-section">
      <h2 class="block-title">作品集</h2>
      <ul class="grid">
        <li v-for="w in workList" :key="w.id">
          <PortfolioCard :work="w" />
        </li>
      </ul>
    </section>

    <section v-else class="block" data-testid="contact-section">
      <h2 class="block-title">联系方式</h2>
      <p class="contact-email">{{ email }}</p>
    </section>
  </main>
</template>

<style scoped>
.page {
  max-width: 900px;
  margin: 0 auto;
  padding: 24px;
  font-family: sans-serif;
}
.site-title {
  font-size: 22px;
  margin: 0 0 12px;
}
.nav {
  display: flex;
  gap: 8px;
  margin-bottom: 20px;
}
.nav button {
  padding: 6px 14px;
  border: 1px solid #bbb;
  border-radius: 6px;
  background: #f5f5f5;
  cursor: pointer;
}
.nav button.on {
  background: #333;
  color: #fff;
  border-color: #333;
}
.block-title {
  font-size: 18px;
  margin: 0 0 8px;
}
.grid {
  list-style: none;
  padding: 0;
  margin: 0;
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 16px;
}
.about-text,
.contact-email {
  color: #444;
}
</style>
