<script setup lang="ts">
import D21EvalMissingPanel from '../components/D21EvalMissingPanel.vue';
import { works, contactEmail } from '../data/works';
import type { Work } from '../data/works';

const workItems: Work[] = works;
</script>

<template>
  <main data-ai-component="home-page" class="home-page">
    <header class="hero">
      <h1 class="hero-name">Grace Hopper</h1>
      <p class="hero-intro">计算机科学先驱，COBOL 语言的推动者</p>
    </header>

    <section class="works">
      <h2 class="works-title">代表作品</h2>
      <ul class="work-list">
        <li v-for="(work, index) in workItems" :key="work.title" class="work-card">
          <h3 class="work-title">{{ work.title }}</h3>
          <p class="work-desc">{{ work.description }}</p>
        </li>
      </ul>
    </section>

    <footer class="contact">
      <p class="contact-label">联系邮箱</p>
      <p class="contact-email">{{ contactEmail }}</p>
    </footer>
  </main>
</template>

<style scoped>
.home-page {
  max-width: 960px;
  margin: 0 auto;
  padding: 48px 24px 64px;
  font-family: system-ui, -apple-system, 'Segoe UI', sans-serif;
  color: #1f2933;
}

.hero {
  text-align: center;
  padding-bottom: 32px;
  border-bottom: 1px solid #e4e7eb;
}

.hero-name {
  margin: 0 0 12px;
  font-size: 40px;
  letter-spacing: 1px;
}

.hero-intro {
  margin: 0;
  font-size: 18px;
  color: #52606d;
}

.works {
  padding: 40px 0;
}

.works-title {
  margin: 0 0 24px;
  font-size: 22px;
  text-align: center;
}

.work-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 20px;
}

.work-card {
  background: #ffffff;
  border: 1px solid #e4e7eb;
  border-radius: 12px;
  padding: 20px;
  box-shadow: 0 2px 10px rgba(15, 23, 42, 0.06);
}

.work-title {
  margin: 0 0 10px;
  font-size: 18px;
  color: #12395b;
}

.work-desc {
  margin: 0;
  font-size: 15px;
  line-height: 1.6;
  color: #52606d;
}

.contact {
  text-align: center;
  padding-top: 32px;
  border-top: 1px solid #e4e7eb;
}

.contact-label {
  margin: 0 0 8px;
  font-size: 14px;
  color: #7b8794;
}

.contact-email {
  margin: 0;
  font-size: 17px;
  font-weight: 600;
  color: #12395b;
}
</style>
