<script setup lang="ts">
import { works } from '../data/works';
import type { Work } from '../data/works';

const items: Work[] = works;
</script>

<template>
  <section data-ai-component="works-gallery" class="works-gallery">
    <h2 class="works-gallery__title">作品集</h2>
    <ul class="works-gallery__list">
      <li v-for="item in items" :key="item.id" class="work-card" :data-testid="`work-card-${item.id}`">
        <div class="work-card__swatch" :style="{ backgroundColor: item.color }"></div>
        <h3 class="work-card__title">{{ item.title }}</h3>
        <p class="work-card__location">{{ item.location }}</p>
      </li>
    </ul>
  </section>
</template>

<style scoped>
.works-gallery__title {
  font-size: 1.5rem;
  margin-bottom: 1rem;
}

.works-gallery__list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 1.25rem;
}

.work-card {
  background: #ffffff;
  border-radius: 10px;
  overflow: hidden;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.08);
  padding-bottom: 0.75rem;
}

.work-card__swatch {
  height: 140px;
  width: 100%;
}

.work-card__title {
  font-size: 1.05rem;
  margin: 0.75rem 1rem 0.25rem;
}

.work-card__location {
  margin: 0 1rem;
  font-size: 0.9rem;
  color: #6b7280;
}
</style>
