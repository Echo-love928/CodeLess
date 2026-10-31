<script setup lang="ts">
import type { Work } from '../data/portfolio';

defineProps<{ work: Work }>();
</script>

<template>
  <div data-ai-component="portfolio-card" class="work-card">
    <div class="swatch" :style="{ backgroundColor: work.color }" role="img" :aria-label="work.title"></div>
    <h3 class="work-title">{{ work.title }}</h3>
    <p class="work-location">{{ work.location }}</p>
  </div>
</template>

<style scoped>
.work-card {
  border: 1px solid #ddd;
  border-radius: 8px;
  overflow: hidden;
  background: #fff;
}
.swatch {
  height: 120px;
  width: 100%;
}
.work-title {
  margin: 8px 12px 4px;
  font-size: 16px;
}
.work-location {
  margin: 0 12px 12px;
  color: #666;
  font-size: 14px;
}
</style>
