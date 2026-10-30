<script setup lang="ts">
import type { Work } from '../data/works';

type WorkTheme = Pick<Work, 'title' | 'location' | 'color'>;

defineProps<{ work: WorkTheme }>();
</script>

<template>
  <article class="work-card" data-ai-component="work-card">
    <div class="swatch" :style="{ backgroundColor: work.color }"></div>
    <h3 class="work-title">{{ work.title }}</h3>
    <p class="work-location">{{ work.location }}</p>
  </article>
</template>

<style scoped>
.work-card {
  border: 1px solid #e0dcd4;
  border-radius: 8px;
  overflow: hidden;
  background: #fff;
}
.swatch {
  height: 140px;
  width: 100%;
}
.work-title {
  margin: 12px 14px 4px;
  font-size: 16px;
}
.work-location {
  margin: 0 14px 14px;
  color: #7a7469;
  font-size: 13px;
}
</style>
